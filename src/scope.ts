import { getAllTags, type App, type TFile } from 'obsidian';
import type { ScopeType } from './types';

export interface ScopeSelection {
	type: Exclude<ScopeType, 'none'>;
	value: string;
}

function tokenize(query: string): string[] {
	return query.match(/-?\[[^\]]+\]|-?(?:[^\s"]+|"[^"]*")+/g) ?? [];
}

function unquote(value: string): string {
	return value.replace(/^"|"$/g, '');
}

function frontmatterValue(file: TFile, app: App, key: string): unknown {
	return app.metadataCache.getFileCache(file)?.frontmatter?.[key];
}

async function matchesTerm(app: App, file: TFile, raw: string): Promise<boolean> {
	const term = raw.toLowerCase();
	if (term.startsWith('path:')) return file.path.toLowerCase().includes(unquote(term.slice(5)));
	if (term.startsWith('file:')) return file.basename.toLowerCase().includes(unquote(term.slice(5)));
	if (term.startsWith('tag:')) {
		const wanted = unquote(term.slice(4)).replace(/^#/, '');
		const tags = getAllTags(app.metadataCache.getFileCache(file) ?? {}) ?? [];
		return tags.some(tag => tag.slice(1).toLowerCase() === wanted || tag.slice(1).toLowerCase().startsWith(`${wanted}/`));
	}
	if (term.startsWith('[') && term.endsWith(']')) {
		const expression = term.slice(1, -1);
		const separator = expression.indexOf(':');
		const key = separator < 0 ? expression : expression.slice(0, separator);
		const expected = separator < 0 ? '' : unquote(expression.slice(separator + 1));
		const value = frontmatterValue(file, app, key);
		if (value === undefined) return false;
		const serialized = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
			? String(value)
			: JSON.stringify(value);
		return expected.length === 0 || serialized.toLowerCase().includes(expected);
	}
	const content = await app.vault.cachedRead(file);
	return content.toLowerCase().includes(unquote(term));
}

export async function resolveScope(app: App, type: ScopeType, value: string): Promise<TFile[]> {
	if (type === 'none' || !value.trim()) return [];
	const files = app.vault.getMarkdownFiles();
	if (type === 'folder') {
		const prefix = `${value.replace(/\/$/, '')}/`;
		return files.filter(file => file.path.startsWith(prefix));
	}
	const tokens = tokenize(value.trim());
	const matches: TFile[] = [];
	for (const file of files) {
		if (await matchesQuery(app, file, tokens)) matches.push(file);
	}
	return matches;
}

export async function fileMatchesQuery(app: App, file: TFile, query: string): Promise<boolean> {
	return matchesQuery(app, file, tokenize(query.trim()));
}

async function matchesQuery(app: App, file: TFile, tokens: string[]): Promise<boolean> {
	for (const token of tokens) {
		const excluded = token.startsWith('-');
		const matched = await matchesTerm(app, file, excluded ? token.slice(1) : token);
		if ((excluded && matched) || (!excluded && !matched)) return false;
	}
	return true;
}
