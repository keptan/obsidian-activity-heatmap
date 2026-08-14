import { ItemView, Notice, Setting, type WorkspaceLeaf } from 'obsidian';
import type EditHistoryPlugin from './main';
import { makeIconButton, renderHeatmap } from './heatmap';

export const VIEW_TYPE = 'edit-history-heatmap-view';

export class EditHistoryView extends ItemView {
	private year = new Date().getFullYear();
	private controlsVisible = false;

	constructor(leaf: WorkspaceLeaf, private plugin: EditHistoryPlugin) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return 'Edit history heatmap'; }
	getIcon(): string { return 'chart-no-axes-column-increasing'; }

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('edit-history-view');
		const header = root.createDiv({ cls: 'edit-heatmap-header' });
		header.createEl('h3', { text: 'Edit history' });
		const actions = header.createDiv({ cls: 'edit-heatmap-actions' });
		const previous = makeIconButton(actions, 'chevron-left', 'Previous year');
		actions.createSpan({ cls: 'edit-heatmap-year', text: String(this.year) });
		const next = makeIconButton(actions, 'chevron-right', 'Next year');
		const settings = makeIconButton(actions, 'settings', 'Heatmap settings');
		previous.addEventListener('click', () => { this.year--; this.render(); });
		next.addEventListener('click', () => { if (this.year < new Date().getFullYear()) { this.year++; this.render(); } });
		settings.addEventListener('click', () => { this.controlsVisible = !this.controlsVisible; this.render(); });

		if (this.controlsVisible) this.renderControls(root);
		const status = root.createDiv({ cls: 'edit-heatmap-status' });
		status.setText(this.plugin.statusText);
		const heatmap = root.createDiv();
		renderHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year);
	}

	private renderControls(root: HTMLElement): void {
		const panel = root.createDiv({ cls: 'edit-heatmap-controls' });
		new Setting(panel)
			.setName('Theme')
			.addDropdown(dropdown => dropdown
				.addOption('changes', 'Additions and removals')
				.addOption('activity', 'Total activity')
				.setValue(this.plugin.settings.theme)
				.onChange(async value => {
					this.plugin.settings.theme = value as 'changes' | 'activity';
					await this.plugin.saveState();
					this.render();
				}));
		new Setting(panel)
			.setName('Measure')
			.addDropdown(dropdown => dropdown
				.addOption('words', 'Words')
				.addOption('lines', 'Lines')
				.addOption('characters', 'Characters')
				.setValue(this.plugin.settings.metric)
				.onChange(async value => {
					this.plugin.settings.metric = value as 'words' | 'lines' | 'characters';
					await this.plugin.saveState();
					this.render();
				}));
		new Setting(panel)
			.setName('Historical cache')
			.setDesc('Import sync snapshots. Note contents are processed in memory and discarded.')
			.addButton(button => button
				.setButtonText(this.plugin.isImporting ? 'Cancel import' : 'Import history')
				.onClick(() => {
					if (this.plugin.isImporting) this.plugin.cancelImport();
					else void this.plugin.importAllHistory().catch(error => {
						console.error('Edit History Heatmap: Import failed', error);
						new Notice('Edit history import failed. Check the developer console.');
					});
					this.render();
				}));
	}
}
