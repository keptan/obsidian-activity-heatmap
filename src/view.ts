import { ItemView, type WorkspaceLeaf } from 'obsidian';
import type EditHistoryPlugin from './main';
import { makeIconButton, renderMonthHeatmap, wordActivityForPeriod } from './heatmap';
import { renderHeatmapControls } from './controls';
import { openScopePicker, scopeLabel } from './scope-picker';

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
		const total = this.contentEl.querySelector<HTMLElement>('.edit-heatmap-period-total');
		total?.setText(`${new Intl.NumberFormat().format(wordActivityForPeriod(this.plugin.cache, this.year, this.month, this.plugin.getScopePaths()))} words edited`);
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
			text: `${new Intl.NumberFormat().format(wordActivityForPeriod(this.plugin.cache, this.year, this.month, this.plugin.getScopePaths()))} words edited`,
		});
		const actions = header.createDiv({ cls: 'edit-heatmap-actions' });
		const previous = makeIconButton(actions, 'chevron-left', 'Previous month');
		const todayButton = actions.createEl('button', { cls: 'edit-heatmap-today-button', text: 'Today' });
		const next = makeIconButton(actions, 'chevron-right', 'Next month');
		const currentScope = scopeLabel(this.plugin);
		const scope = actions.createEl('button', {
			cls: 'edit-heatmap-scope-button',
			text: 'Scope',
			attr: { 'aria-label': currentScope, title: currentScope },
		});
		const settings = makeIconButton(actions, 'settings', 'Heatmap settings');
		scope.addEventListener('click', () => openScopePicker(scope, this.plugin));
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

		if (this.controlsVisible) {
			const panel = root.createDiv({ cls: 'edit-heatmap-controls' });
			renderHeatmapControls(panel, this.plugin, () => this.render());
		}
		const heatmap = root.createDiv();
		renderMonthHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year, this.month, this.plugin.getScopePaths());
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

}
