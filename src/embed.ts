import { MarkdownRenderChild } from 'obsidian';
import type EditHistoryPlugin from './main';
import { makeIconButton, renderMonthHeatmap, renderYearHeatmap } from './heatmap';

type ViewMode = 'year' | 'month';

export class EmbeddedHeatmap extends MarkdownRenderChild {
	private mode: ViewMode;
	private year = new Date().getFullYear();
	private month = new Date().getMonth();

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

	render(): void {
		this.containerEl.empty();
		this.containerEl.addClass('edit-heatmap-embed');
		const header = this.containerEl.createDiv({ cls: 'edit-heatmap-header edit-heatmap-embed-header' });
		const actions = header.createDiv({ cls: 'edit-heatmap-actions' });
		const previous = makeIconButton(actions, 'chevron-left', this.mode === 'year' ? 'Previous year' : 'Previous month');
		const label = actions.createSpan({ cls: 'edit-heatmap-date-label' });
		const next = makeIconButton(actions, 'chevron-right', this.mode === 'year' ? 'Next year' : 'Next month');
		const toggles = header.createDiv({ cls: 'edit-heatmap-actions' });
		const yearButton = makeIconButton(toggles, 'calendar-range', 'Year view');
		const monthButton = makeIconButton(toggles, 'calendar-days', 'Month view');
		yearButton.toggleClass('is-active', this.mode === 'year');
		monthButton.toggleClass('is-active', this.mode === 'month');

		if (this.mode === 'year') label.setText(String(this.year));
		else label.setText(new Date(this.year, this.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
		previous.addEventListener('click', () => { this.shift(-1); this.render(); });
		next.addEventListener('click', () => {
			if (this.canMoveForward()) { this.shift(1); this.render(); }
		});
		yearButton.addEventListener('click', () => { this.mode = 'year'; this.render(); });
		monthButton.addEventListener('click', () => { this.mode = 'month'; this.render(); });

		const heatmap = this.containerEl.createDiv();
		if (this.mode === 'year') renderYearHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year);
		else renderMonthHeatmap(heatmap, this.plugin.cache, this.plugin.settings, this.year, this.month);
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
