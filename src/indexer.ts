import type { TFile } from 'obsidian';
import { calculateMetrics } from './metrics';
import { makeTransition, removeFileTransitions, transitionId } from './cache';
import type { EditHistoryCache } from './types';
import { SyncHistoryClient } from './sync-history';

export interface ImportProgress {
	completedFiles: number;
	totalFiles: number;
	versions: number;
	activePaths: string[];
	fileCompleted: boolean;
}

export class HistoryIndexer {
	private cancelled = false;
	private readonly versionReadConcurrency = 6;

	constructor(private client: SyncHistoryClient, private cache: EditHistoryCache) {}

	cancel(): void {
		this.cancelled = true;
	}

	async indexFile(file: TFile, onVersion?: () => void): Promise<number> {
		const result = await this.client.listVersions(file.path);
		if (result.versions.length === 0) return 0;

		const dailyVersions = this.dailySnapshots(result.versions);
		const anchor = dailyVersions[0];
		if (!anchor) return 0;
		const contents = await this.readVersions(dailyVersions);
		let previous = contents.get(anchor.uid) ?? '';
		const replacements: EditHistoryCache['transitions'] = {};

		let processed = 0;
		for (let index = 1; index < dailyVersions.length; index++) {
			if (this.cancelled) break;
			const version = dailyVersions[index];
			if (!version) continue;
			const current = contents.get(version.uid);
			if (current === undefined) continue;
			const id = transitionId(version.uid);
			replacements[id] = makeTransition(id, file.path, version.ts, await calculateMetrics(previous, current));
			previous = current;
			processed++;
			onVersion?.();
			await new Promise<void>(resolve => window.setTimeout(resolve, 0));
		}

		if (!this.cancelled) {
			removeFileTransitions(this.cache, file.path);
			Object.assign(this.cache.transitions, replacements);
			const newest = result.versions[0];
			if (newest) this.cache.checkpoints[file.path] = {
				newestUid: newest.uid,
				newestTimestamp: newest.ts,
				mtime: file.stat.mtime,
			};
		}
		return processed;
	}

	private dailySnapshots<T extends { uid: number; ts: number; deleted: boolean; folder: boolean }>(versions: T[]): T[] {
		const newestByDay = new Map<string, T>();
		for (const version of versions) {
			if (version.deleted || version.folder) continue;
			const date = new Date(version.ts);
			const day = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
			const selected = newestByDay.get(day);
			if (!selected || version.ts > selected.ts) newestByDay.set(day, version);
		}
		return Array.from(newestByDay.values()).sort((a, b) => a.ts - b.ts);
	}

	private async readVersions(versions: Array<{ uid: number }>): Promise<Map<number, string>> {
		const contents = new Map<number, string>();
		let nextIndex = 0;
		const worker = async () => {
			while (!this.cancelled) {
				const version = versions[nextIndex++];
				if (!version) return;
				contents.set(version.uid, await this.client.readVersion(version.uid));
			}
		};
		await Promise.all(Array.from(
			{ length: Math.min(this.versionReadConcurrency, versions.length) },
			() => worker(),
		));
		return contents;
	}

	async indexFiles(files: TFile[], concurrency: number, onProgress: (progress: ImportProgress) => void): Promise<number> {
		this.cancelled = false;
		let nextIndex = 0;
		let completedFiles = 0;
		let versions = 0;
		const activePaths = new Set<string>();
		const emit = (fileCompleted: boolean) => onProgress({
			completedFiles,
			totalFiles: files.length,
			versions,
			activePaths: Array.from(activePaths),
			fileCompleted,
		});
		const worker = async () => {
			while (!this.cancelled) {
				const index = nextIndex++;
				const file = files[index];
				if (!file) return;
				activePaths.add(file.path);
				emit(false);
				await this.indexFile(file, () => {
					versions++;
					emit(false);
				});
				activePaths.delete(file.path);
				completedFiles++;
				emit(true);
			}
		};
		await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
		return versions;
	}
}
