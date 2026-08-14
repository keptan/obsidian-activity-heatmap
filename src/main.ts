import { Notice, Plugin, TFile } from 'obsidian';
import { createCache, mergeCaches, renameCachedFile } from './cache';
import { HistoryIndexer } from './indexer';
import { EditHistorySettingTab } from './settings';
import { SyncHistoryClient } from './sync-history';
import { DEFAULT_SETTINGS, type EditHistoryCache, type EditHistorySettings } from './types';
import { EditHistoryView, VIEW_TYPE } from './view';

interface StoredState {
	settings?: Partial<EditHistorySettings>;
	cache?: EditHistoryCache;
}

export default class EditHistoryPlugin extends Plugin {
	settings: EditHistorySettings = { ...DEFAULT_SETTINGS };
	cache: EditHistoryCache = createCache();
	statusText = 'Ready';
	isImporting = false;
	private client!: SyncHistoryClient;
	private indexer: HistoryIndexer | null = null;
	private editTimers = new Map<string, number>();
	private saveTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadState();
		this.client = new SyncHistoryClient(this.app);
		this.registerView(VIEW_TYPE, leaf => new EditHistoryView(leaf, this));
		this.addRibbonIcon('chart-no-axes-column-increasing', 'Open edit history heatmap', () => void this.activateView());
		this.addCommand({ id: 'open-heatmap', name: 'Open heatmap', callback: () => void this.activateView() });
		this.addCommand({ id: 'import-sync-history', name: 'Import sync history', callback: () => void this.importAllHistory() });
		this.addSettingTab(new EditHistorySettingTab(this.app, this));

		this.registerEvent(this.app.vault.on('modify', file => {
			if (file instanceof TFile && file.extension === 'md') this.scheduleFileIndex(file);
		}));
		this.registerEvent(this.app.vault.on('create', file => {
			if (file instanceof TFile && file.extension === 'md') this.scheduleFileIndex(file);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				renameCachedFile(this.cache, oldPath, file.path);
				this.scheduleSave();
				this.scheduleFileIndex(file);
			}
		}));

		this.app.workspace.onLayoutReady(() => void this.reconcileChangedFiles());
		this.registerInterval(window.setInterval(() => void this.reconcileChangedFiles(), 5 * 60 * 1000));
	}

	onunload(): void {
		for (const timer of this.editTimers.values()) window.clearTimeout(timer);
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
	}

	async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
			await leaf?.setViewState({ type: VIEW_TYPE, active: true });
		}
		if (leaf) await this.app.workspace.revealLeaf(leaf);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof EditHistoryView) view.render();
		}
	}

	async importAllHistory(): Promise<void> {
		if (this.isImporting) return;
		if (!this.client.isAvailable()) {
			new Notice('Enable Obsidian Sync before importing history.');
			return;
		}
		this.isImporting = true;
		this.statusText = 'Preparing historical import…';
		this.refreshViews();
		this.indexer = new HistoryIndexer(this.client, this.cache);
		const files = this.app.vault.getMarkdownFiles();
		try {
			const versions = await this.indexer.indexFiles(files, this.settings.maxConcurrentFiles, progress => {
				this.statusText = `${progress.completedFiles}/${progress.totalFiles} files · ${progress.versions} versions · ${progress.currentPath}`;
				if (progress.completedFiles % 100 === 0) void this.saveState();
				this.refreshViews();
			});
			this.statusText = `Imported ${versions} versions across ${files.length} files`;
			new Notice(this.statusText);
		} finally {
			this.isImporting = false;
			this.indexer = null;
			await this.saveState();
			this.refreshViews();
		}
	}

	cancelImport(): void {
		this.indexer?.cancel();
		this.statusText = 'Cancelling after current requests…';
	}

	private scheduleFileIndex(file: TFile): void {
		const existing = this.editTimers.get(file.path);
		if (existing !== undefined) window.clearTimeout(existing);
		this.editTimers.set(file.path, window.setTimeout(() => {
			this.editTimers.delete(file.path);
			void this.indexFile(file);
		}, 15_000));
	}

	private async indexFile(file: TFile): Promise<void> {
		if (this.isImporting || !this.client.isAvailable()) return;
		try {
			const indexer = new HistoryIndexer(this.client, this.cache);
			const versions = await indexer.indexFile(file);
			if (versions > 0) {
				this.statusText = `Updated ${file.path}`;
				await this.saveState();
				this.refreshViews();
			}
		} catch (error) {
			console.error('Edit History Heatmap: Failed to index changed file', file.path, error);
		}
	}

	private async reconcileChangedFiles(): Promise<void> {
		if (this.isImporting || !this.client.isAvailable()) return;
		const changed = this.app.vault.getMarkdownFiles().filter(file => {
			const checkpoint = this.cache.checkpoints[file.path];
			return checkpoint ? file.stat.mtime > checkpoint.mtime : file.stat.mtime >= this.cache.trackingStartedAt;
		});
		for (const file of changed) this.scheduleFileIndex(file);
	}

	private async loadState(): Promise<void> {
		const stored = await this.loadData() as StoredState | null;
		this.settings = { ...DEFAULT_SETTINGS, ...stored?.settings };
		if (stored?.cache?.schemaVersion === 1) this.cache = stored.cache;
	}

	async saveState(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.saveData({ settings: this.settings, cache: this.cache } satisfies StoredState);
	}

	private scheduleSave(): void {
		if (this.saveTimer !== null) return;
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.saveState();
		}, 1000);
	}

	async onExternalSettingsChange(): Promise<void> {
		const stored = await this.loadData() as StoredState | null;
		if (stored?.cache?.schemaVersion === 1) this.cache = mergeCaches(this.cache, stored.cache);
		if (stored?.settings) this.settings = { ...this.settings, ...stored.settings };
		await this.saveState();
		this.refreshViews();
	}
}
