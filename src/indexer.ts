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
	private readonly versionReadConcurrency = 24;

	constructor(private client: SyncHistoryClient, private cache: EditHistoryCache) {}

	cancel(): void {
		this.cancelled = true;
	}

	async indexFile(file: TFile, full = false, onVersion?: () => void): Promise<number> {
		const checkpoint = full ? undefined : this.cache.checkpoints[file.path];
		const result = await this.client.listVersions(file.path, checkpoint?.newestUid);
		if (result.versions.length === 0) return 0;

		const incremental = Boolean(checkpoint && result.foundStop);
		if (!incremental) removeFileTransitions(this.cache, file.path);
		const chronological = [...result.versions].reverse();
		let startIndex = 0;
		const anchor = chronological[0];
		if (!anchor) return 0;
		const readable = chronological.filter((version, index) => index === 0 || (!version.deleted && !version.folder));
		const contents = await this.readVersions(readable);
		let previous = contents.get(anchor.uid) ?? '';
		startIndex = 1;

		let processed = 0;
		for (let index = startIndex; index < chronological.length; index++) {
			if (this.cancelled) break;
			const version = chronological[index];
			if (!version || version.deleted || version.folder) continue;
			const current = contents.get(version.uid);
			if (current === undefined) continue;
			const id = transitionId(version.uid);
			this.cache.transitions[id] = makeTransition(id, file.path, version.ts, await calculateMetrics(previous, current));
			previous = current;
			processed++;
			onVersion?.();
		}

		if (!this.cancelled) {
			const newest = result.versions[0];
			if (newest) this.cache.checkpoints[file.path] = {
				newestUid: newest.uid,
				newestTimestamp: newest.ts,
				mtime: file.stat.mtime,
			};
		}
		return processed;
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
				await this.indexFile(file, false, () => {
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
