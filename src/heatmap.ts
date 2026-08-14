import { setIcon } from 'obsidian';
import { aggregateByDay, type FileDayAggregate } from './cache';
import type { EditHistoryCache, EditHistorySettings, HeatmapTheme, Metric } from './types';

interface DayData {
	files: FileDayAggregate[];
	added: number;
	removed: number;
	wordsAdded: number;
}

interface SelectionFileData {
	path: string;
	added: number;
	removed: number;
}

function localDay(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function yearWindow(year: number, today = new Date()): { start: Date; end: Date } {
	const month = today.getMonth();
	const day = today.getDate();
	const end = new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()));
	const startYear = year - 1;
	const start = new Date(startYear, month, Math.min(day, new Date(startYear, month + 1, 0).getDate()));
	return { start, end };
}

export function formatYearWindow(year: number): string {
	const { start, end } = yearWindow(year);
	const format = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
	return `${format(start)} – ${format(end)}`;
}

function buildDays(cache: EditHistoryCache, metric: Metric, paths?: ReadonlySet<string>): Map<string, DayData> {
	const result = new Map<string, DayData>();
	for (const [day, files] of aggregateByDay(cache, paths)) {
		result.set(day, {
			files,
			added: files.reduce((sum, file) => sum + file.counts[metric].added, 0),
			removed: files.reduce((sum, file) => sum + file.counts[metric].removed, 0),
			wordsAdded: files.reduce((sum, file) => sum + file.counts.words.added, 0),
		});
	}
	return result;
}

function percentileMax(days: Map<string, DayData>, selector: (day: DayData) => number): number {
	const values = Array.from(days.values(), selector).filter(value => value > 0).sort((a, b) => a - b);
	if (values.length === 0) return 1;
	return values[Math.min(values.length - 1, Math.floor(values.length * 0.9))] ?? 1;
}

function setCellStyle(cell: HTMLElement, day: DayData, theme: HeatmapTheme, max: number): void {
	if (theme === 'changes') {
		cell.classList.add('edit-heatmap-cell-changes');
		cell.style.setProperty('--edit-add-mix', `${Math.round(Math.min(1, day.added / max) * 90)}%`);
		cell.style.setProperty('--edit-remove-mix', `${Math.round(Math.min(1, day.removed / max) * 90)}%`);
	} else {
		cell.style.setProperty('--edit-activity-mix', `${Math.round(Math.min(1, (day.added + day.removed) / max) * 82)}%`);
	}
}

function formatNumber(value: number): string {
	return new Intl.NumberFormat().format(value);
}

export function wordActivityForPeriod(cache: EditHistoryCache, year: number, month?: number, paths?: ReadonlySet<string>): number {
	const prefix = month === undefined ? null : `${year}-${String(month + 1).padStart(2, '0')}-`;
	const window = month === undefined ? yearWindow(year) : null;
	const startDay = window ? localDay(window.start) : '';
	const endDay = window ? localDay(window.end) : '';
	let total = 0;
	for (const [day, files] of aggregateByDay(cache, paths)) {
		if (prefix ? !day.startsWith(prefix) : day < startDay || day > endDay) continue;
		for (const file of files) total += file.counts.words.added + file.counts.words.removed;
	}
	return total;
}

function tooltipContent(day: string, data: DayData, metric: Metric): DocumentFragment {
	const fragment = createFragment();
	const root = fragment.createDiv({ cls: 'edit-heatmap-tooltip-content' });
	root.createDiv({ cls: 'edit-heatmap-tooltip-title', text: new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'medium' }) });
	root.createDiv({ cls: 'edit-heatmap-tooltip-total', text: `${formatNumber(data.added)} ${metric} edited` });
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

function setupCell(cell: HTMLElement, key: string, data: DayData, settings: EditHistorySettings, max: number): void {
	cell.dataset.day = key;
	cell.dataset.added = String(data.added);
	cell.dataset.removed = String(data.removed);
	cell.dataset.wordsAdded = String(data.wordsAdded);
	cell.dataset.files = JSON.stringify(data.files.map(file => ({
		path: file.path,
		added: file.counts[settings.metric].added,
		removed: file.counts[settings.metric].removed,
	}) satisfies SelectionFileData));
	if (data.added + data.removed > 0) setCellStyle(cell, data, settings.theme, max);
	cell.addEventListener('mouseenter', event => showTooltip(event.currentTarget as HTMLElement, tooltipContent(key, data, settings.metric)));
	cell.addEventListener('mouseleave', hideTooltip);
}

function maxForRange(days: Map<string, DayData>, settings: EditHistorySettings, inRange: (day: string) => boolean): number {
	const ranged = new Map(Array.from(days).filter(([day]) => inRange(day)));
	return percentileMax(ranged, day => settings.theme === 'activity' ? day.added + day.removed : Math.max(day.added, day.removed));
}

export function renderYearHeatmap(container: HTMLElement, cache: EditHistoryCache, settings: EditHistorySettings, year: number, paths?: ReadonlySet<string>): void {
	container.empty();
	container.addClass('edit-heatmap');
	const days = buildDays(cache, settings.metric, paths);
	const { start, end } = yearWindow(year);
	const startDay = localDay(start);
	const endDay = localDay(end);
	const max = maxForRange(days, settings, day => day >= startDay && day <= endDay);
	const wrapper = container.createDiv({ cls: 'edit-heatmap-grid-wrapper' });
	const labels = wrapper.createDiv({ cls: 'edit-heatmap-day-labels' });
	for (const label of ['', 'Mon', '', 'Wed', '', 'Fri', '']) labels.createDiv({ text: label });
	const gridArea = wrapper.createDiv({ cls: 'edit-heatmap-grid-area' });
	const monthRow = gridArea.createDiv({ cls: 'edit-heatmap-months' });
	const grid = gridArea.createDiv({ cls: 'edit-heatmap-grid' });
	const cursor = new Date(end);
	cursor.setDate(cursor.getDate() - cursor.getDay() - 52 * 7);
	for (let week = 0; week < 53; week++) {
		const columnDates = Array.from({ length: 7 }, (_, offset) => {
			const date = new Date(cursor);
			date.setDate(cursor.getDate() + offset);
			return date;
		});
		const validDates = columnDates.filter(date => date >= start && date <= end);
		const monthStart = week === 0
			? validDates[0]
			: validDates.find(date => date.getDate() === 1);
		const monthLabel = monthStart?.toLocaleDateString(undefined, { month: 'short' }) ?? '';
		monthRow.createSpan({ cls: 'edit-heatmap-month-label', text: monthLabel });
		const column = grid.createDiv({ cls: 'edit-heatmap-week' });
		for (const date of columnDates) {
			const key = localDay(date);
			const cell = column.createDiv({ cls: 'edit-heatmap-cell' });
			if (date < start || date > end) {
				cell.addClass('is-outside');
				continue;
			}
			const data = days.get(key) ?? { files: [], added: 0, removed: 0, wordsAdded: 0 };
			setupCell(cell, key, data, settings, max);
		}
		cursor.setDate(cursor.getDate() + 7);
	}
	attachDragSelection(container, settings.metric);
}

export function renderMonthHeatmap(
	container: HTMLElement,
	cache: EditHistoryCache,
	settings: EditHistorySettings,
	year: number,
	month: number,
	paths?: ReadonlySet<string>,
): void {
	container.empty();
	container.addClass('edit-heatmap', 'edit-heatmap-month-view');
	const days = buildDays(cache, settings.metric, paths);
	const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
	const max = maxForRange(days, settings, day => day.startsWith(monthPrefix));
	const header = container.createDiv({ cls: 'edit-heatmap-month-header' });
	for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) header.createDiv({ cls: 'edit-heatmap-month-weekday', text: label });
	const grid = container.createDiv({ cls: 'edit-heatmap-month-grid' });
	const first = new Date(year, month, 1);
	const cursor = new Date(first);
	cursor.setDate(cursor.getDate() - cursor.getDay());
	const today = localDay(new Date());
	for (let index = 0; index < 42; index++) {
		const date = new Date(cursor);
		date.setDate(cursor.getDate() + index);
		const key = localDay(date);
		const data = days.get(key) ?? { files: [], added: 0, removed: 0, wordsAdded: 0 };
		const cell = grid.createDiv({ cls: 'edit-heatmap-cell edit-heatmap-calendar-day' });
		if (date.getMonth() !== month) cell.addClass('is-adjacent-month');
		if (key === today) cell.addClass('is-today');
		cell.createSpan({ cls: 'edit-heatmap-month-day-number', text: String(date.getDate()) });
		setupCell(cell, key, data, settings, max);
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
			let added = 0, removed = 0, wordsAdded = 0, selected = 0;
			const fileTotals = new Map<string, ChangeCount>();
			for (const cell of Array.from(container.querySelectorAll<HTMLElement>('[data-day]'))) {
				const rect = cell.getBoundingClientRect();
				const hit = rect.right >= left && rect.left <= right && rect.bottom >= top && rect.top <= bottom;
				cell.toggleClass('is-selected', hit);
				if (hit) {
					selected++;
					added += Number(cell.dataset.added) || 0;
					removed += Number(cell.dataset.removed) || 0;
					wordsAdded += Number(cell.dataset.wordsAdded) || 0;
					for (const file of parseSelectionFiles(cell.dataset.files)) {
						const total = fileTotals.get(file.path) ?? { added: 0, removed: 0 };
						total.added += file.added;
						total.removed += file.removed;
						fileTotals.set(file.path, total);
					}
				}
			}
			renderSelectionStats(stats, selected, added, removed, wordsAdded, metric, fileTotals);
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

interface ChangeCount { added: number; removed: number }

function parseSelectionFiles(value: string | undefined): SelectionFileData[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is SelectionFileData => {
			if (!item || typeof item !== 'object') return false;
			const candidate = item as Partial<SelectionFileData>;
			return typeof candidate.path === 'string' && typeof candidate.added === 'number' && typeof candidate.removed === 'number';
		});
	} catch {
		return [];
	}
}

function renderSelectionStats(
	stats: HTMLElement,
	selected: number,
	added: number,
	removed: number,
	wordsAdded: number,
	metric: Metric,
	fileTotals: Map<string, ChangeCount>,
): void {
	stats.empty();
	const average = selected > 0 ? wordsAdded / selected : 0;
	const formattedAverage = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(average);
	stats.createDiv({ cls: 'edit-heatmap-selection-title', text: `${formattedAverage} words added/day · +${formatNumber(added)} −${formatNumber(removed)} ${metric}` });
	const files = Array.from(fileTotals, ([path, counts]) => ({ path, ...counts }))
		.sort((a, b) => b.added + b.removed - a.added - a.removed);
	for (const file of files.slice(0, 20)) {
		const row = stats.createDiv({ cls: 'edit-heatmap-tooltip-file' });
		row.createSpan({ cls: 'edit-heatmap-tooltip-path', text: file.path });
		row.createSpan({ cls: 'edit-heatmap-added', text: `+${formatNumber(file.added)}` });
		row.createSpan({ cls: 'edit-heatmap-removed', text: `−${formatNumber(file.removed)}` });
	}
	if (files.length > 20) stats.createDiv({ cls: 'edit-heatmap-tooltip-more', text: `${files.length - 20} more files` });
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
