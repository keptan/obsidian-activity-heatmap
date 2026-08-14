import { getAllTags, type App, type TFile } from 'obsidian';

export interface ScopeSelection {
	all: boolean;
	folders: string[];
	tags: string[];
}

export function hasScope(scope: ScopeSelection): boolean {
	return scope.all || scope.folders.length > 0 || scope.tags.length > 0;
}

export function fileMatchesScope(app: App, file: TFile, scope: ScopeSelection): boolean {
	if (scope.all) return true;
	if (scope.folders.some(folder => file.path.startsWith(`${folder.replace(/\/$/, '')}/`))) return true;
	if (scope.tags.length === 0) return false;
	const fileTags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
	return scope.tags.some(selected => fileTags.some(tag => tag === selected || tag.startsWith(`${selected}/`)));
}

export function resolveScope(app: App, scope: ScopeSelection): TFile[] {
	if (!hasScope(scope)) return [];
	return app.vault.getMarkdownFiles().filter(file => fileMatchesScope(app, file, scope));
}
