import { setIcon } from 'obsidian';
import type EditHistoryPlugin from './main';
import type { ScopeSelection } from './scope';

let activePicker: HTMLElement | null = null;
let activeAnchor: HTMLElement | null = null;
let activeCleanup: ((commit: boolean) => void) | null = null;

export function openScopePicker(anchor: HTMLElement, plugin: EditHistoryPlugin): void {
	if (activePicker && activeAnchor === anchor) {
		activeCleanup?.(true);
		return;
	}
	activeCleanup?.(true);
	plugin.beginScopeEditing();
	const draft: ScopeSelection = {
		all: plugin.settings.scopeAll,
		folders: [...plugin.settings.scopeFolders],
		tags: [...plugin.settings.scopeTags],
	};
	const picker = document.body.createDiv({ cls: 'edit-heatmap-scope-picker' });
	activePicker = picker;
	activeAnchor = anchor;
	const rect = anchor.getBoundingClientRect();
	picker.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 430))}px`;
	picker.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 328))}px`;
	const results = picker.createDiv({ cls: 'edit-heatmap-scope-results' });
	const updates: Array<() => void> = [];

	let closed = false;
	const close = (commit: boolean) => {
		if (closed) return;
		closed = true;
		document.removeEventListener('pointerdown', onOutside, true);
		document.removeEventListener('keydown', onKeydown, true);
		picker.remove();
		if (activePicker === picker) activePicker = null;
		if (activeAnchor === anchor) activeAnchor = null;
		if (activeCleanup === close) activeCleanup = null;
		if (commit) void plugin.applyScope(draft);
	};
	const makeOption = (parent: HTMLElement, title: string, description: string, selected: () => boolean, toggle: () => void) => {
		const button = parent.createEl('button', { cls: 'edit-heatmap-scope-option' });
		const check = button.createSpan({ cls: 'edit-heatmap-scope-check' });
		const copy = button.createDiv({ cls: 'edit-heatmap-scope-copy' });
		copy.createDiv({ cls: 'edit-heatmap-scope-option-title', text: title });
		copy.createDiv({ cls: 'edit-heatmap-scope-option-description', text: description });
		const update = () => {
			const active = selected();
			button.toggleClass('is-selected', active);
			check.empty();
			if (active) setIcon(check, 'check');
		};
		button.addEventListener('click', () => { toggle(); for (const refresh of updates) refresh(); });
		updates.push(update);
		update();
	};

	makeOption(results, 'All .md files', `${plugin.app.vault.getMarkdownFiles().length} files`, () => draft.all, () => {
		draft.all = !draft.all;
		if (draft.all) { draft.folders = []; draft.tags = []; }
	});
	const folders = plugin.getScopeFolders();
	if (folders.length > 0) results.createDiv({ cls: 'edit-heatmap-scope-section', text: 'Folders' });
	for (const folder of folders) {
		makeOption(results, folder.path, `${folder.fileCount} .md ${folder.fileCount === 1 ? 'file' : 'files'}`, () => draft.folders.includes(folder.path), () => {
			draft.all = false;
			draft.folders = draft.folders.includes(folder.path)
				? draft.folders.filter(path => path !== folder.path)
				: [...draft.folders, folder.path];
		});
	}
	const tags = plugin.getScopeTags();
	if (tags.length > 0) results.createDiv({ cls: 'edit-heatmap-scope-section', text: 'Tags' });
	for (const tag of tags) {
		makeOption(results, tag.tag, `${tag.fileCount} .md ${tag.fileCount === 1 ? 'file' : 'files'}`, () => draft.tags.includes(tag.tag), () => {
			draft.all = false;
			draft.tags = draft.tags.includes(tag.tag)
				? draft.tags.filter(value => value !== tag.tag)
				: [...draft.tags, tag.tag];
		});
	}
	const onOutside = (event: PointerEvent) => {
		if (!picker.contains(event.target as Node) && event.target !== anchor) close(true);
	};
	const onKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') close(true);
	};
	document.addEventListener('pointerdown', onOutside, true);
	document.addEventListener('keydown', onKeydown, true);
	activeCleanup = close;
}

export function scopeLabel(plugin: EditHistoryPlugin): string {
	if (plugin.settings.scopeAll) return 'All .md files';
	const selections = [...plugin.settings.scopeFolders, ...plugin.settings.scopeTags];
	if (selections.length === 0) return 'Choose scope';
	return selections.length === 1 ? selections[0] ?? 'Choose scope' : `${selections.length} scopes`;
}

export function closeScopePicker(commit = true): void {
	activeCleanup?.(commit);
}
