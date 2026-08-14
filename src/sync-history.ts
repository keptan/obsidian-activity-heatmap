import type { App } from 'obsidian';

export interface SyncVersion {
	uid: number;
	ts: number;
	path: string;
	size: number;
	device: string;
	deleted: boolean;
	folder: boolean;
}

interface HistoryPage {
	items: SyncVersion[];
	more: boolean;
}

interface SyncInstance {
	getHistory(path: string, uid?: number | null): Promise<HistoryPage>;
	getContentForVersion(uid: number): Promise<ArrayBuffer>;
}

interface AppWithSync extends App {
	internalPlugins: {
		plugins: {
			sync?: { enabled: boolean; instance: SyncInstance };
		};
	};
}

export class SyncHistoryClient {
	private requestQueue: Promise<void> = Promise.resolve();
	private lastRequestAt = 0;
	private readonly minimumRequestIntervalMs = 125;

	constructor(private app: App) {}

	isAvailable(): boolean {
		return Boolean((this.app as AppWithSync).internalPlugins?.plugins?.sync?.enabled);
	}

	private get instance(): SyncInstance {
		const sync = (this.app as AppWithSync).internalPlugins?.plugins?.sync;
		if (!sync?.enabled) throw new Error('Obsidian Sync is not enabled');
		return sync.instance;
	}

	async listVersions(path: string, stopAtUid?: number): Promise<{ versions: SyncVersion[]; foundStop: boolean }> {
		const versions: SyncVersion[] = [];
		let cursor: number | null = null;
		let foundStop = false;
		do {
			const page = await this.request(() => this.instance.getHistory(path, cursor));
			for (const version of page.items) {
				versions.push(version);
				if (version.uid === stopAtUid) {
					foundStop = true;
					return { versions, foundStop };
				}
			}
			if (!page.more || page.items.length === 0) break;
			cursor = page.items[page.items.length - 1]?.uid ?? null;
		} while (cursor !== null);
		return { versions, foundStop };
	}

	async readVersion(uid: number): Promise<string> {
		const content = await this.request(() => this.instance.getContentForVersion(uid));
		return new TextDecoder('utf-8').decode(new Uint8Array(content));
	}

	private async request<T>(operation: () => Promise<T>): Promise<T> {
		let release = () => {};
		const previous = this.requestQueue;
		this.requestQueue = new Promise<void>(resolve => { release = resolve; });
		await previous;
		const wait = Math.max(0, this.minimumRequestIntervalMs - (Date.now() - this.lastRequestAt));
		if (wait > 0) await new Promise(resolve => window.setTimeout(resolve, wait));
		this.lastRequestAt = Date.now();
		release();

		let delay = 500;
		for (let attempt = 0; attempt < 4; attempt++) {
			try {
				return await operation();
			} catch (error) {
				if (attempt === 3) throw error;
				await new Promise(resolve => window.setTimeout(resolve, delay));
				delay *= 2;
			}
		}
		throw new Error('Sync request failed');
	}
}
