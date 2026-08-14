import { SearchComponent } from 'obsidian';
import type EditHistoryPlugin from './main';
import type { ScopeSelection } from './scope';

let activePicker: HTMLElement | null = null;
let activeCleanup: (() => void) | null = null;

export function openScopePicker(anchor: HTMLElement, plugin: EditHistoryPlugin): void {
	activeCleanup?.();
	const picker = document.body.createDiv({ cls: 'edit-heatmap-scope-picker' });
	activePicker = picker;
	const rect = anchor.getBoundingClientRect();
	picker.style.top = `${rect.bottom + 6}px`;
	picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 328))}px`;
	const search = new SearchComponent(picker).setPlaceholder('Search folders or enter a query…');
	const results = picker.createDiv({ cls: 'edit-heatmap-scope-results' });

	const close = () => {
		document.removeEventListener('pointerdown', onOutside, true);
		picker.remove();
		if (activePicker === picker) activePicker = null;
		if (activeCleanup === close) activeCleanup = null;
	};
	const choose = (scope: ScopeSelection) => {
		close();
		void plugin.selectScope(scope);
	};
	const render = (filter: string) => {
		results.empty();
		const query = filter.trim();
		if (!query) {
			const allButton = results.createEl('button', { cls: 'edit-heatmap-scope-option' });
			allButton.createDiv({ cls: 'edit-heatmap-scope-option-title', text: 'All .md files' });
			allButton.addEventListener('click', () => choose({ type: 'all', value: '*' }));
		}
		if (query) {
			const queryButton = results.createEl('button', { cls: 'edit-heatmap-scope-option' });
			queryButton.createDiv({ cls: 'edit-heatmap-scope-option-title', text: `Use query: ${query}` });
			queryButton.createDiv({ cls: 'edit-heatmap-scope-option-description', text: 'Supports path:, file:, tag:, [property:value], text, and -exclusions' });
			queryButton.addEventListener('click', () => choose({ type: 'query', value: query }));
		}
		const folders = plugin.getScanFolders().filter(folder => folder.toLowerCase().includes(query.toLowerCase()));
		for (const folder of folders.slice(0, 100)) {
			const button = results.createEl('button', { cls: 'edit-heatmap-scope-option', text: folder });
			button.addEventListener('click', () => choose({ type: 'folder', value: folder }));
		}
		if (!query && folders.length === 0) results.createDiv({ cls: 'edit-heatmap-scope-empty', text: 'No folders found' });
	};
	const onOutside = (event: PointerEvent) => {
		if (!picker.contains(event.target as Node) && event.target !== anchor) close();
	};
	search.onChange(render);
	render('');
	document.addEventListener('pointerdown', onOutside, true);
	activeCleanup = close;
	window.setTimeout(() => search.inputEl.focus());
}

export function scopeLabel(plugin: EditHistoryPlugin): string {
	if (plugin.settings.scopeType === 'none') return 'Choose scope';
	if (plugin.settings.scopeType === 'all') return 'All .md files';
	return plugin.settings.scopeType === 'folder' ? plugin.settings.scopeValue : `Query: ${plugin.settings.scopeValue}`;
}

export function closeScopePicker(): void {
	activeCleanup?.();
}
