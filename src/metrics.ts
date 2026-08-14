import { diffChars, diffLines, diffWordsWithSpace, type Change } from 'diff';
import type { ChangeCount, MetricCounts } from './types';

function countChanges(changes: Change[], measure: (value: string) => number): ChangeCount {
	const result = { added: 0, removed: 0 };
	for (const change of changes) {
		if (!change.added && !change.removed) continue;
		const amount = measure(change.value);
		if (change.added) result.added += amount;
		if (change.removed) result.removed += amount;
	}
	return result;
}

export function countWords(value: string): number {
	return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

export function countLines(value: string): number {
	if (!value) return 0;
	const breaks = value.match(/\n/gu)?.length ?? 0;
	return breaks + (value.endsWith('\n') ? 0 : 1);
}

export async function calculateMetrics(before: string, after: string): Promise<MetricCounts> {
	const [words, lines, characters] = await Promise.all([
		new Promise<Change[]>(resolve => diffWordsWithSpace(before, after, { callback: resolve })),
		new Promise<Change[]>(resolve => diffLines(before, after, { callback: resolve })),
		new Promise<Change[]>(resolve => diffChars(before, after, { callback: resolve })),
	]);
	return {
		words: countChanges(words, countWords),
		lines: countChanges(lines, countLines),
		characters: countChanges(characters, value => Array.from(value).length),
	};
}
