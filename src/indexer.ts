import type { TFile } from 'obsidian';
import { calculateMetrics } from './metrics';
import { makeTransition, removeFileTransitions, transitionId } from './cache';
import type { EditHistoryCache } from './types';
import { SyncHistoryClient } from './sync-history';

export interface ImportProgress {
	completedFiles: number;
	totalFiles: number;
	versions: number;
	currentPath: string;
}

export class HistoryIndexer {
	private cancelled = false;

	constructor(private client: SyncHistoryClient, private cache: EditHistoryCache) {}

	cancel(): void {
		this.cancelled = true;
	}

	async indexFile(file: TFile, full = false): Promise<number> {
		const checkpoint = full ? undefined : this.cache.checkpoints[file.path];
		const result = await this.client.listVersions(file.path, checkpoint?.newestUid);
		if (result.versions.length === 0) return 0;

		const incremental = Boolean(checkpoint && result.foundStop);
		if (!incremental) removeFileTransitions(this.cache, file.path);
		const chronological = [...result.versions].reverse();
		let previous = '';
		let startIndex = 0;
		if (incremental || chronological.length > 0) {
			const anchor = chronological[0];
			if (!anchor) return 0;
			previous = await this.client.readVersion(anchor.uid);
			startIndex = 1;
		}

		let processed = 0;
		for (let index = startIndex; index < chronological.length; index++) {
			if (this.cancelled) break;
			const version = chronological[index];
			if (!version || version.deleted || version.folder) continue;
			const current = await this.client.readVersion(version.uid);
			const id = transitionId(version.uid);
			this.cache.transitions[id] = makeTransition(id, file.path, version.ts, calculateMetrics(previous, current));
			previous = current;
			processed++;
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

	async indexFiles(files: TFile[], concurrency: number, onProgress: (progress: ImportProgress) => void): Promise<number> {
		this.cancelled = false;
		let nextIndex = 0;
		let completedFiles = 0;
		let versions = 0;
		const worker = async () => {
			while (!this.cancelled) {
				const index = nextIndex++;
				const file = files[index];
				if (!file) return;
				versions += await this.indexFile(file);
				completedFiles++;
				onProgress({ completedFiles, totalFiles: files.length, versions, currentPath: file.path });
			}
		};
		await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
		return versions;
	}
}
