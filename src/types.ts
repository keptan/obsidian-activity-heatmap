export type Metric = 'words' | 'lines' | 'characters';
export type HeatmapTheme = 'changes' | 'activity';

export interface ChangeCount {
	added: number;
	removed: number;
}

export interface MetricCounts {
	words: ChangeCount;
	lines: ChangeCount;
	characters: ChangeCount;
}

export interface CachedTransition {
	id: string;
	path: string;
	day: string;
	timestamp: number;
	counts: MetricCounts;
}

export interface FileCheckpoint {
	newestUid: number;
	newestTimestamp: number;
	mtime: number;
}

export interface EditHistoryCache {
	schemaVersion: 1;
	trackingStartedAt: number;
	transitions: Record<string, CachedTransition>;
	checkpoints: Record<string, FileCheckpoint>;
}

export interface EditHistorySettings {
	theme: HeatmapTheme;
	metric: Metric;
	activityColor: string;
	maxConcurrentFiles: number;
}

export const DEFAULT_SETTINGS: EditHistorySettings = {
	theme: 'changes',
	metric: 'lines',
	activityColor: '#7c5cff',
	maxConcurrentFiles: 2,
};

export function emptyCounts(): MetricCounts {
	return {
		words: { added: 0, removed: 0 },
		lines: { added: 0, removed: 0 },
		characters: { added: 0, removed: 0 },
	};
}
