import { MarkdownRenderChild } from 'obsidian';
import type EditHistoryPlugin from './main';
import { formatYearWindow, makeIconButton, renderMonthHeatmap, renderYearHeatmap, wordActivityForPeriod } from './heatmap';
import { renderHeatmapControls } from './controls';
import { openScopePicker, scopeLabel } from './scope-picker';

type ViewMode = 'year' | 'month';

export class EmbeddedHeatmap extends MarkdownRenderChild {
	private mode: ViewMode;
	private year = new Date().getFullYear();
	private month = new Date().getMonth();
	private controlsVisible = false;
	private slideDirection: 'left' | 'right' | 'none' = 'none';

	constructor(container: HTMLElement, private plugin: EditHistoryPlugin, source: string) {
		super(container);
		this.mode = source.trim().toLowerCase() === 'month' ? 'month' : 'year';
	}

	onload(): void {
		this.plugin.registerEmbeddedView(this);
		this.render();
	}

	onunload(): void {
		this.plugin.unregisterEmbeddedView(this);
	}

	handleDateRollover(previous: Date, current: Date): void {
		if (this.mode === 'year' && this.year === previous.getFullYear()) {
			this.year = current.getFullYear();
		} else if (this.mode === 'month' && this.year === previous.getFullYear() && this.month === previous.getMonth()) {
			this.year = current.getFullYear();
			this.month = current.getMonth();
		}
		this.render();
	}

	render(): void {
		const slideDirection = this.slideDirection;
		this.slideDirection = 'none';
		this.containerEl.empty();
		this.containerEl.addClass('edit-heatmap-embed');
		const header = this.containerEl.createDiv({ cls: 'edit-heatmap-header edit-heatmap-embed-header' });
		header.createDiv({
			cls: 'edit-heatmap-period-total',
			text: `${new Intl.NumberFormat().format(wordActivityForPeriod(this.plugin.cache, this.year, this.mode === 'month' ? this.month : undefined, this.plugin.getScopePaths()))} words edited`,
		});
		const controls = header.createDiv({ cls: 'edit-heatmap-embed-controls' });
		const actions = controls.createDiv({ cls: 'edit-heatmap-actions' });
		const previous = makeIconButton(actions, 'chevron-left', this.mode === 'year' ? 'Previous year' : 'Previous month');
		const label = actions.createSpan({ cls: 'edit-heatmap-date-label' });
		const next = makeIconButton(actions, 'chevron-right', this.mode === 'year' ? 'Next year' : 'Next month');
		const scope = actions.createEl('button', { cls: 'edit-heatmap-scope-button', text: scopeLabel(this.plugin) });
		scope.addEventListener('click', () => openScopePicker(scope, this.plugin));
		const toggles = controls.createDiv({ cls: 'edit-heatmap-actions' });
		const yearButton = makeIconButton(toggles, 'calendar-range', 'Year view');
		const monthButton = makeIconButton(toggles, 'calendar-days', 'Month view');
		const settingsButton = makeIconButton(toggles, 'settings', 'Heatmap settings');
		yearButton.toggleClass('is-active', this.mode === 'year');
		monthButton.toggleClass('is-active', this.mode === 'month');

		if (this.mode === 'year') label.setText(formatYearWindow(this.year));
		else label.setText(new Date(this.year, this.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
		previous.addEventListener('click', () => { this.shift(-1); this.slideDirection = 'right'; this.render(); });
		next.addEventListener('click', () => {
			if (this.canMoveForward()) { this.shift(1); this.slideDirection = 'left'; this.render(); }
		});
		yearButton.addEventListener('click', () => { this.mode = 'year'; this.render(); });
		monthButton.addEventListener('click', () => { this.mode = 'month'; this.render(); });
		settingsButton.addEventListener('click', () => { this.controlsVisible = !this.controlsVisible; this.render(); });

		if (this.controlsVisible) {
			const panel = this.containerEl.createDiv({ cls: 'edit-heatmap-controls' });
			renderHeatmapControls(panel, this.plugin, () => this.render());
		}

		const heatmap = this.containerEl.createDiv({ cls: 'edit-heatmap-content' });
		if (slideDirection !== 'none') heatmap.addClass(`slide-${slideDirection}`);
		if (this.mode === 'year') renderYearHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year, this.plugin.getScopePaths());
		else renderMonthHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year, this.month, this.plugin.getScopePaths());
	}

	private shift(direction: -1 | 1): void {
		if (this.mode === 'year') {
			this.year += direction;
			return;
		}
		this.month += direction;
		if (this.month < 0) { this.month = 11; this.year--; }
		if (this.month > 11) { this.month = 0; this.year++; }
	}

	private canMoveForward(): boolean {
		const now = new Date();
		if (this.mode === 'year') return this.year < now.getFullYear();
		return this.year < now.getFullYear() || (this.year === now.getFullYear() && this.month < now.getMonth());
	}
}
