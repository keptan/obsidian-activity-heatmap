import { getAllTags, Notice, Plugin, TFile } from 'obsidian';
import { createCache, mergeCaches, renameCachedFile } from './cache';
import { HistoryIndexer } from './indexer';
import { EditHistorySettingTab } from './settings';
import { SyncHistoryClient } from './sync-history';
import { DEFAULT_SETTINGS, type EditHistoryCache, type EditHistorySettings } from './types';
import { EditHistoryView, VIEW_TYPE } from './view';
import { removeHeatmapOverlays } from './heatmap';
import { EmbeddedHeatmap } from './embed';
import { fileMatchesScope, hasScope, resolveScope, type ScopeSelection } from './scope';
import { closeScopePicker } from './scope-picker';

interface StoredState {
	settings?: Partial<EditHistorySettings> & { scopeType?: string; scopeValue?: string };
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
	private embeddedViews = new Set<EmbeddedHeatmap>();
	private scopePaths = new Set<string>();
	private statusBarEl!: HTMLElement;
	private statusClearTimer: number | null = null;
	private cancelRequested = false;
	private restartScanRequested = false;

	async onload(): Promise<void> {
		await this.loadState();
		this.client = new SyncHistoryClient(this.app);
		this.statusBarEl = this.addStatusBarItem();
		this.updateStatusBar();
		this.registerView(VIEW_TYPE, leaf => new EditHistoryView(leaf, this));
		this.addRibbonIcon('chart-no-axes-column-increasing', 'Open edit history heatmap', () => void this.activateView());
		this.addCommand({ id: 'open-heatmap', name: 'Open heatmap', callback: () => void this.activateView() });
		this.addCommand({ id: 'import-sync-history', name: 'Import sync history', callback: () => void this.importAllHistory() });
		this.addSettingTab(new EditHistorySettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor('edit-history-heatmap', (source, element, context) => {
			context.addChild(new EmbeddedHeatmap(element, this, source));
		});

		this.registerEvent(this.app.vault.on('modify', file => {
			if (file instanceof TFile && file.extension === 'md') this.scheduleFileIndex(file);
		}));
		this.registerEvent(this.app.vault.on('create', file => {
			if (file instanceof TFile && file.extension === 'md') this.scheduleFileIndex(file);
		}));
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				renameCachedFile(this.cache, oldPath, file.path);
				this.scopePaths.delete(oldPath);
				this.scheduleSave();
				this.scheduleFileIndex(file);
			}
		}));

		this.app.workspace.onLayoutReady(() => void this.loadSelectedScope());
		this.registerInterval(window.setInterval(() => void this.reconcileChangedFiles(), 5 * 60 * 1000));
	}

	onunload(): void {
		for (const timer of this.editTimers.values()) window.clearTimeout(timer);
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		if (this.statusClearTimer !== null) window.clearTimeout(this.statusClearTimer);
		removeHeatmapOverlays();
		closeScopePicker(false);
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
			if (view instanceof EditHistoryView) view.refreshFromPlugin();
		}
		for (const view of this.embeddedViews) view.render();
	}

	registerEmbeddedView(view: EmbeddedHeatmap): void { this.embeddedViews.add(view); }
	unregisterEmbeddedView(view: EmbeddedHeatmap): void { this.embeddedViews.delete(view); }

	async importAllHistory(): Promise<void> {
		if (this.isImporting) return;
		if (!this.client.isAvailable()) {
			new Notice('Enable Obsidian Sync before importing history.');
			return;
		}
		if (!hasScope(this.currentScope())) {
			new Notice('Choose at least one folder or tag from a heatmap first.');
			return;
		}
		this.isImporting = true;
		this.cancelRequested = false;
		this.setStatus('Preparing historical import…');
		this.refreshViews();
		this.indexer = new HistoryIndexer(this.client, this.cache);
		const files = this.getFilesInScanScope().filter(file => {
			const checkpoint = this.cache.checkpoints[file.path];
			return !checkpoint || file.stat.mtime > checkpoint.mtime;
		});
		if (files.length === 0) {
			this.isImporting = false;
			this.indexer = null;
			this.setStatus('Scope history is up to date');
			this.refreshViews();
			this.scheduleStatusClear();
			return;
		}
		try {
			const versions = await this.indexer.indexFiles(files, 2, progress => {
				this.setStatus(`${progress.completedFiles}/${progress.totalFiles} files · ${progress.versions} versions · ${progress.currentPath}`);
				if (progress.completedFiles % 100 === 0) void this.saveState();
			});
			if (this.cancelRequested) {
				this.setStatus('History scan paused');
			} else {
				this.setStatus(`Imported ${versions} versions across ${files.length} files`);
				new Notice(this.statusText);
			}
		} finally {
			const restart = this.restartScanRequested;
			this.restartScanRequested = false;
			this.isImporting = false;
			this.indexer = null;
			await this.saveState();
			this.refreshViews();
			if (!restart) this.scheduleStatusClear();
			if (restart) void this.importAllHistory().catch(error => console.error('Edit History Heatmap: Deferred scope import failed', error));
		}
	}

	getScopeFolders(): Array<{ path: string; fileCount: number }> {
		const counts = new Map<string, number>();
		for (const file of this.app.vault.getMarkdownFiles()) {
			const parts = file.path.split('/');
			parts.pop();
			for (let depth = 1; depth <= parts.length; depth++) {
				const folder = parts.slice(0, depth).join('/');
				counts.set(folder, (counts.get(folder) ?? 0) + 1);
			}
		}
		return this.app.vault.getAllFolders()
			.map(folder => ({ path: folder.path, fileCount: counts.get(folder.path) ?? 0 }))
			.filter(folder => folder.path.length > 0)
			.sort((a, b) => b.fileCount - a.fileCount || a.path.localeCompare(b.path));
	}

	getScopeTags(): Array<{ tag: string; fileCount: number }> {
		const fileTags = this.app.vault.getMarkdownFiles().map(file => new Set(getAllTags(this.app.metadataCache.getFileCache(file) ?? {}) ?? []));
		const tags = new Set(Array.from(fileTags, tagsForFile => Array.from(tagsForFile)).flat());
		const counts = new Map<string, number>();
		for (const tagsForFile of fileTags) {
			const matched = new Set<string>();
			for (const fileTag of tagsForFile) {
				const parts = fileTag.split('/');
				for (let depth = 1; depth <= parts.length; depth++) {
					const candidate = parts.slice(0, depth).join('/');
					if (tags.has(candidate)) matched.add(candidate);
				}
			}
			for (const tag of matched) counts.set(tag, (counts.get(tag) ?? 0) + 1);
		}
		return Array.from(tags, tag => ({ tag, fileCount: counts.get(tag) ?? 0 }))
			.sort((a, b) => b.fileCount - a.fileCount || a.tag.localeCompare(b.tag));
	}

	getFilesInScanScope(): TFile[] {
		return this.app.vault.getMarkdownFiles().filter(file => this.scopePaths.has(file.path));
	}

	getScopePaths(): ReadonlySet<string> { return this.scopePaths; }

	beginScopeEditing(): void {
		if (this.isImporting) this.cancelImport();
	}

	async applyScope(scope: ScopeSelection): Promise<void> {
		this.settings.scopeAll = scope.all;
		this.settings.scopeFolders = [...scope.folders];
		this.settings.scopeTags = [...scope.tags];
		const files = resolveScope(this.app, scope);
		this.scopePaths = new Set(files.map(file => file.path));
		await this.saveState();
		this.setStatus(`${files.length} files in scope`);
		this.refreshViews();
		if (!hasScope(scope)) {
			this.restartScanRequested = false;
			this.setStatus(this.isImporting ? 'History scan paused' : 'Ready');
			return;
		}
		if (this.isImporting) {
			this.restartScanRequested = true;
			this.setStatus('Waiting to scan adjusted scope…');
		} else {
			void this.importAllHistory().catch(error => console.error('Edit History Heatmap: Scope import failed', error));
		}
	}

	private async loadSelectedScope(): Promise<void> {
		if (!hasScope(this.currentScope())) {
			this.scopePaths.clear();
			this.refreshViews();
			return;
		}
		const files = resolveScope(this.app, this.currentScope());
		this.scopePaths = new Set(files.map(file => file.path));
		this.refreshViews();
	}

	async clearCache(): Promise<void> {
		if (this.isImporting) {
			new Notice('Cancel the active history scan before clearing the cache.');
			return;
		}
		this.cache = createCache();
		this.cache.clearedAt = Date.now();
		this.setStatus('Cache cleared');
		await this.saveState();
		this.refreshViews();
		new Notice('Edit history cache cleared.');
		this.scheduleStatusClear();
	}

	cancelImport(): void {
		this.cancelRequested = true;
		this.indexer?.cancel();
		this.setStatus('Cancelling after current requests…');
	}

	private scheduleFileIndex(file: TFile): void {
		if (!hasScope(this.currentScope())) return;
		const existing = this.editTimers.get(file.path);
		if (existing !== undefined) window.clearTimeout(existing);
		this.editTimers.set(file.path, window.setTimeout(() => {
			this.editTimers.delete(file.path);
			void this.refreshScopeAndIndexFile(file);
		}, 15_000));
	}

	private async refreshScopeAndIndexFile(file: TFile): Promise<void> {
		if (fileMatchesScope(this.app, file, this.currentScope())) this.scopePaths.add(file.path);
		else this.scopePaths.delete(file.path);
		await this.indexFile(file);
	}

	private async indexFile(file: TFile): Promise<void> {
		if (this.isImporting || !this.client.isAvailable() || !this.scopePaths.has(file.path)) return;
		try {
			const indexer = new HistoryIndexer(this.client, this.cache);
			const versions = await indexer.indexFile(file);
			if (versions > 0) {
				this.setStatus(`Updated ${file.path}`);
				await this.saveState();
				this.refreshViews();
			}
		} catch (error) {
			console.error('Edit History Heatmap: Failed to index changed file', file.path, error);
		}
	}

	private async reconcileChangedFiles(): Promise<void> {
		if (this.isImporting || !this.client.isAvailable() || !hasScope(this.currentScope())) return;
		const changed = this.getFilesInScanScope().filter(file => {
			const checkpoint = this.cache.checkpoints[file.path];
			return checkpoint ? file.stat.mtime > checkpoint.mtime : file.stat.mtime >= this.cache.trackingStartedAt;
		});
		for (const file of changed) this.scheduleFileIndex(file);
	}

	private async loadState(): Promise<void> {
		const stored = await this.loadData() as StoredState | null;
		this.settings = this.normalizeSettings(stored?.settings);
		if (stored?.cache?.schemaVersion === 1) this.cache = stored.cache;
	}

	private currentScope(): ScopeSelection {
		return {
			all: this.settings.scopeAll,
			folders: this.settings.scopeFolders,
			tags: this.settings.scopeTags,
		};
	}

	private normalizeSettings(stored?: StoredState['settings']): EditHistorySettings {
		const legacyFolders = !stored?.scopeFolders && stored?.scopeType === 'folder' && stored.scopeValue
			? [stored.scopeValue]
			: [];
		return {
			theme: stored?.theme ?? DEFAULT_SETTINGS.theme,
			metric: stored?.metric ?? DEFAULT_SETTINGS.metric,
			scopeAll: stored?.scopeAll ?? (!stored?.scopeFolders && stored?.scopeType === 'all'),
			scopeFolders: stored?.scopeFolders ?? legacyFolders,
			scopeTags: stored?.scopeTags ?? [],
		};
	}

	async saveState(): Promise<void> {
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
		}
		await this.saveData({ settings: this.settings, cache: this.cache } satisfies StoredState);
	}

	private setStatus(text: string): void {
		if (text !== 'Ready' && this.statusClearTimer !== null) {
			window.clearTimeout(this.statusClearTimer);
			this.statusClearTimer = null;
		}
		this.statusText = text;
		this.updateStatusBar();
	}

	private updateStatusBar(): void {
		if (!this.statusBarEl) return;
		this.statusBarEl.setText(this.statusText === 'Ready' ? '' : this.statusText);
		this.statusBarEl.toggleClass('is-hidden', this.statusText === 'Ready');
	}

	private scheduleStatusClear(): void {
		if (this.statusClearTimer !== null) window.clearTimeout(this.statusClearTimer);
		this.statusClearTimer = window.setTimeout(() => {
			this.statusClearTimer = null;
			this.setStatus('Ready');
		}, 5_000);
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
		if (stored?.settings) this.settings = this.normalizeSettings(stored.settings);
		await this.saveState();
		await this.loadSelectedScope();
	}
}
