import type { CachedTransition, EditHistoryCache, FileCheckpoint, MetricCounts } from './types';
import { emptyCounts } from './types';

export function createCache(now = Date.now()): EditHistoryCache {
	return { schemaVersion: 2, trackingStartedAt: now, clearedAt: 0, transitions: {}, checkpoints: {} };
}

export function mergeCaches(local: EditHistoryCache, remote: EditHistoryCache): EditHistoryCache {
	const localClearedAt = local.clearedAt ?? 0;
	const remoteClearedAt = remote.clearedAt ?? 0;
	if (localClearedAt > remoteClearedAt) return local;
	if (remoteClearedAt > localClearedAt) return remote;
	const checkpoints: Record<string, FileCheckpoint> = { ...local.checkpoints };
	for (const [path, checkpoint] of Object.entries(remote.checkpoints)) {
		const existing = checkpoints[path];
		if (!existing || checkpoint.newestTimestamp > existing.newestTimestamp) {
			checkpoints[path] = { ...checkpoint, initialSnapshotCounted: checkpoint.initialSnapshotCounted || existing?.initialSnapshotCounted };
		} else if (checkpoint.initialSnapshotCounted) {
			existing.initialSnapshotCounted = true;
		}
	}
	return {
		schemaVersion: 2,
		trackingStartedAt: Math.min(local.trackingStartedAt, remote.trackingStartedAt),
		clearedAt: localClearedAt,
		transitions: { ...local.transitions, ...remote.transitions },
		checkpoints,
	};
}

export interface FileDayAggregate {
	path: string;
	counts: MetricCounts;
}

export function aggregateByDay(cache: EditHistoryCache, paths?: ReadonlySet<string>): Map<string, FileDayAggregate[]> {
	const byDayAndFile = new Map<string, Map<string, MetricCounts>>();
	for (const transition of Object.values(cache.transitions)) {
		if (paths && !paths.has(transition.path)) continue;
		let files = byDayAndFile.get(transition.day);
		if (!files) byDayAndFile.set(transition.day, files = new Map<string, MetricCounts>());
		let counts = files.get(transition.path);
		if (!counts) files.set(transition.path, counts = emptyCounts());
		addCounts(counts, transition.counts);
	}
	const result = new Map<string, FileDayAggregate[]>();
	for (const [day, files] of byDayAndFile) {
		result.set(day, Array.from(files, ([path, counts]) => ({ path, counts })));
	}
	return result;
}

export function addCounts(target: MetricCounts, source: MetricCounts): void {
	for (const metric of ['words', 'lines', 'characters'] as const) {
		target[metric].added += source[metric].added;
		target[metric].removed += source[metric].removed;
	}
}

export function removeFileTransitions(cache: EditHistoryCache, path: string): void {
	for (const [id, transition] of Object.entries(cache.transitions)) {
		if (transition.path === path) delete cache.transitions[id];
	}
	delete cache.checkpoints[path];
}

export function renameCachedFile(cache: EditHistoryCache, oldPath: string, newPath: string): void {
	for (const transition of Object.values(cache.transitions)) {
		if (transition.path === oldPath) transition.path = newPath;
	}
	const checkpoint = cache.checkpoints[oldPath];
	if (checkpoint) {
		cache.checkpoints[newPath] = checkpoint;
		delete cache.checkpoints[oldPath];
	}
}

export function transitionId(versionUid: number): string {
	return String(versionUid);
}

export function makeTransition(id: string, path: string, timestamp: number, counts: MetricCounts): CachedTransition {
	const date = new Date(timestamp);
	const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	return { id, path, day, timestamp, counts };
}
