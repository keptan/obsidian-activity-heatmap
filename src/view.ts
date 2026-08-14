import { ItemView, Notice, Setting, type WorkspaceLeaf } from 'obsidian';
import type EditHistoryPlugin from './main';
import { makeIconButton, renderMonthHeatmap, wordActivityForPeriod } from './heatmap';
import { ConfirmClearCacheModal } from './confirm-clear-modal';

export const VIEW_TYPE = 'edit-history-heatmap-view';

export class EditHistoryView extends ItemView {
	private year = new Date().getFullYear();
	private month = new Date().getMonth();
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

	refreshFromPlugin(): void {
		if (!this.controlsVisible) {
			this.render();
			return;
		}
		const status = this.contentEl.querySelector<HTMLElement>('.edit-heatmap-status');
		status?.setText(this.plugin.statusText);
		status?.toggleClass('is-hidden', this.plugin.statusText === 'Ready');
		const total = this.contentEl.querySelector<HTMLElement>('.edit-heatmap-period-total');
		total?.setText(`${new Intl.NumberFormat().format(wordActivityForPeriod(this.plugin.cache, this.year, this.month))} words edited`);
	}

	render(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('edit-history-view');
		const header = root.createDiv({ cls: 'edit-heatmap-calendar-nav' });
		const heading = header.createDiv({ cls: 'edit-heatmap-calendar-heading' });
		const title = heading.createEl('h3', { cls: 'edit-heatmap-calendar-title' });
		title.createSpan({ cls: 'edit-heatmap-calendar-month', text: new Date(this.year, this.month, 1).toLocaleDateString(undefined, { month: 'short' }) });
		title.createSpan({ cls: 'edit-heatmap-calendar-year', text: ` ${this.year}` });
		title.addEventListener('click', () => { this.goToToday(); this.render(); });
		heading.createDiv({
			cls: 'edit-heatmap-period-total',
			text: `${new Intl.NumberFormat().format(wordActivityForPeriod(this.plugin.cache, this.year, this.month))} words edited`,
		});
		const actions = header.createDiv({ cls: 'edit-heatmap-actions' });
		const previous = makeIconButton(actions, 'chevron-left', 'Previous month');
		const todayButton = actions.createEl('button', { cls: 'edit-heatmap-today-button', text: 'Today' });
		const next = makeIconButton(actions, 'chevron-right', 'Next month');
		const settings = makeIconButton(actions, 'settings', 'Heatmap settings');
		previous.addEventListener('click', () => { this.shiftMonth(-1); this.render(); });
		todayButton.addEventListener('click', () => { this.goToToday(); this.render(); });
		next.addEventListener('click', () => {
			const now = new Date();
			if (this.year < now.getFullYear() || (this.year === now.getFullYear() && this.month < now.getMonth())) {
				this.shiftMonth(1);
				this.render();
			}
		});
		settings.addEventListener('click', () => { this.controlsVisible = !this.controlsVisible; this.render(); });

		if (this.controlsVisible) this.renderControls(root);
		const status = root.createDiv({ cls: 'edit-heatmap-status', text: this.plugin.statusText });
		status.toggleClass('is-hidden', this.plugin.statusText === 'Ready');
		const heatmap = root.createDiv();
		renderMonthHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year, this.month);
	}

	private shiftMonth(direction: -1 | 1): void {
		this.month += direction;
		if (this.month < 0) { this.month = 11; this.year--; }
		if (this.month > 11) { this.month = 0; this.year++; }
	}

	private goToToday(): void {
		const today = new Date();
		this.year = today.getFullYear();
		this.month = today.getMonth();
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
			.setName('Scan vault history')
			.addDropdown(dropdown => {
				dropdown.addOption('', 'Entire vault');
				for (const folder of this.plugin.getScanFolders()) dropdown.addOption(folder, folder);
				dropdown.setValue(this.plugin.settings.scanFolder).onChange(async value => {
					this.plugin.settings.scanFolder = value;
					await this.plugin.saveState();
				});
			});
		new Setting(panel)
			.setName('Historical cache')
			.setDesc('Import sync snapshots. Note contents are processed in memory and discarded.')
			.addButton(button => button
				.setButtonText(this.plugin.isImporting ? 'Cancel scan' : 'Scan history')
				.onClick(() => {
					if (this.plugin.isImporting) this.plugin.cancelImport();
					else void this.plugin.importAllHistory().catch(error => {
						console.error('Edit History Heatmap: Import failed', error);
						new Notice('Edit history import failed. Check the developer console.');
					});
					this.render();
				}));
		new Setting(panel)
			.setName('Clear cache')
			.setDesc('Remove imported aggregate counts and checkpoints.')
			.addButton(button => button
				.setButtonText('Clear cache')
				.setDestructive()
				.onClick(() => new ConfirmClearCacheModal(this.plugin).open()));
	}
}
