import { setIcon } from 'obsidian';
import { aggregateByDay, type FileDayAggregate } from './cache';
import type { EditHistoryCache, EditHistorySettings, HeatmapTheme, Metric } from './types';

interface DayData {
	files: FileDayAggregate[];
	added: number;
	removed: number;
}

function localDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildDays(cache: EditHistoryCache, metric: Metric): Map<string, DayData> {
	const result = new Map<string, DayData>();
	for (const [day, files] of aggregateByDay(cache)) {
		result.set(day, {
			files,
			added: files.reduce((sum, file) => sum + file.counts[metric].added, 0),
			removed: files.reduce((sum, file) => sum + file.counts[metric].removed, 0),
		});
	}
	return result;
}

function percentileMax(days: Map<string, DayData>, selector: (day: DayData) => number): number {
	const values = Array.from(days.values(), selector).filter(value => value > 0).sort((a, b) => a - b);
	if (values.length === 0) return 1;
	return values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] ?? 1;
}

function setCellStyle(cell: HTMLElement, day: DayData, theme: HeatmapTheme, max: number, color: string): void {
	if (theme === 'changes') {
		cell.classList.add('edit-heatmap-cell-changes');
		cell.style.setProperty('--edit-add-mix', `${Math.round(Math.min(1, day.added / max) * 90)}%`);
		cell.style.setProperty('--edit-remove-mix', `${Math.round(Math.min(1, day.removed / max) * 90)}%`);
	} else {
		cell.style.setProperty('--edit-activity-color', color);
		cell.style.setProperty('--edit-activity-mix', `${Math.round(Math.min(1, (day.added + day.removed) / max) * 82)}%`);
	}
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat().format(value);
}

function tooltipContent(day: string, data: DayData, metric: Metric): DocumentFragment {
	const fragment = createFragment();
	const root = fragment.createDiv({ cls: 'edit-heatmap-tooltip-content' });
	root.createDiv({ cls: 'edit-heatmap-tooltip-title', text: new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) });
	root.createDiv({ cls: 'edit-heatmap-tooltip-total', text: `${formatNumber(data.added + data.removed)} ${metric} edited` });
	const sorted = [...data.files].sort((a, b) => {
		const ac = a.counts[metric];
		const bc = b.counts[metric];
		return bc.added + bc.removed - ac.added - ac.removed;
	});
	for (const file of sorted.slice(0, 8)) {
		const row = root.createDiv({ cls: 'edit-heatmap-tooltip-file' });
		row.createSpan({ cls: 'edit-heatmap-tooltip-path', text: file.path });
		row.createSpan({ cls: 'edit-heatmap-added', text: `+${formatNumber(file.counts[metric].added)}` });
		row.createSpan({ cls: 'edit-heatmap-removed', text: `−${formatNumber(file.counts[metric].removed)}` });
	}
	if (sorted.length > 8) root.createDiv({ cls: 'edit-heatmap-tooltip-more', text: `${sorted.length - 8} more files` });
	return fragment;
}

export function renderHeatmap(container: HTMLElement, cache: EditHistoryCache, settings: EditHistorySettings, year: number): void {
	container.empty();
	container.addClass('edit-heatmap');
	const days = buildDays(cache, settings.metric);
	const max = percentileMax(days, day => settings.theme === 'activity' ? day.added + day.removed : Math.max(day.added, day.removed));
	const wrapper = container.createDiv({ cls: 'edit-heatmap-grid-wrapper' });
	const labels = wrapper.createDiv({ cls: 'edit-heatmap-day-labels' });
	for (const label of ['', 'Mon', '', 'Wed', '', 'Fri', '']) labels.createDiv({ text: label });
	const gridArea = wrapper.createDiv({ cls: 'edit-heatmap-grid-area' });
	const monthRow = gridArea.createDiv({ cls: 'edit-heatmap-months' });
	const grid = gridArea.createDiv({ cls: 'edit-heatmap-grid' });
	const cursor = new Date(year, 0, 1);
	cursor.setDate(cursor.getDate() - cursor.getDay());
	const end = new Date(year, 11, 31);
	let week = 0;
	while (cursor <= end && week < 54) {
		const previous = new Date(cursor.getTime() - 7 * 86400000);
		monthRow.createSpan({ text: week === 0 || cursor.getMonth() !== previous.getMonth() ? cursor.toLocaleDateString(undefined, { month: 'short' }) : '' });
		const column = grid.createDiv({ cls: 'edit-heatmap-week' });
		for (let offset = 0; offset < 7; offset++) {
			const date = new Date(cursor);
			date.setDate(cursor.getDate() + offset);
			const key = localDay(date);
			const cell = column.createDiv({ cls: 'edit-heatmap-cell' });
			if (date.getFullYear() !== year) {
				cell.addClass('is-outside');
				continue;
			}
			const data = days.get(key) ?? { files: [], added: 0, removed: 0 };
			cell.dataset.day = key;
			cell.dataset.added = String(data.added);
			cell.dataset.removed = String(data.removed);
			if (data.added + data.removed > 0) setCellStyle(cell, data, settings.theme, max, settings.activityColor);
			cell.addEventListener('mouseenter', event => showTooltip(event.currentTarget as HTMLElement, tooltipContent(key, data, settings.metric)));
			cell.addEventListener('mouseleave', hideTooltip);
		}
		cursor.setDate(cursor.getDate() + 7);
		week++;
	}
	attachDragSelection(container, settings.metric);
}

let tooltip: HTMLElement | null = null;
let activeSelectionCleanup: (() => void) | null = null;
function showTooltip(target: HTMLElement, content: DocumentFragment): void {
	if (!tooltip) tooltip = document.body.createDiv({ cls: 'edit-heatmap-tooltip' });
	tooltip.replaceChildren(content);
	tooltip.addClass('is-visible');
	const rect = target.getBoundingClientRect();
	const tooltipRect = tooltip.getBoundingClientRect();
	tooltip.style.left = `${Math.max(6, Math.min(window.innerWidth - tooltipRect.width - 6, rect.left + rect.width / 2 - tooltipRect.width / 2))}px`;
	tooltip.style.top = `${rect.top - tooltipRect.height - 8 < 6 ? rect.bottom + 8 : rect.top - tooltipRect.height - 8}px`;
}

function hideTooltip(): void {
	tooltip?.removeClass('is-visible');
}

function attachDragSelection(container: HTMLElement, metric: Metric): void {
	container.addEventListener('pointerdown', event => {
		if (event.button !== 0) return;
		const target = (event.target as HTMLElement).closest<HTMLElement>('[data-day]');
		if (!target) return;
		event.preventDefault();
		activeSelectionCleanup?.();
		hideTooltip();
		const startX = event.clientX;
		const startY = event.clientY;
		const box = document.body.createDiv({ cls: 'edit-heatmap-selection-box' });
		const stats = box.createDiv({ cls: 'edit-heatmap-selection-stats' });
		const update = (x: number, y: number) => {
			const left = Math.min(startX, x), top = Math.min(startY, y), right = Math.max(startX, x), bottom = Math.max(startY, y);
			box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${right - left}px`; box.style.height = `${bottom - top}px`;
			let added = 0, removed = 0, selected = 0;
			for (const cell of Array.from(container.querySelectorAll<HTMLElement>('[data-day]'))) {
				const rect = cell.getBoundingClientRect();
				const hit = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
				cell.toggleClass('is-selected', hit);
				if (hit) { selected++; added += Number(cell.dataset.added) || 0; removed += Number(cell.dataset.removed) || 0; }
			}
			stats.setText(`${selected} days · +${formatNumber(added)} −${formatNumber(removed)} ${metric}`);
		};
		const finish = () => {
			for (const cell of Array.from(container.querySelectorAll<HTMLElement>('.is-selected'))) cell.removeClass('is-selected');
			box.remove();
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', finish);
			activeSelectionCleanup = null;
		};
		const move = (moveEvent: PointerEvent) => update(moveEvent.clientX, moveEvent.clientY);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', finish);
		activeSelectionCleanup = finish;
		update(startX, startY);
	});
}

export function removeHeatmapOverlays(): void {
	activeSelectionCleanup?.();
	activeSelectionCleanup = null;
	tooltip?.remove();
	tooltip = null;
}

export function makeIconButton(parent: HTMLElement, icon: string, label: string): HTMLButtonElement {
	const button = parent.createEl('button', { cls: 'clickable-icon edit-heatmap-icon-button', attr: { 'aria-label': label } });
	setIcon(button, icon);
	return button;
}
