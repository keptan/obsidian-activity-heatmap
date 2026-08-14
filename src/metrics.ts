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

function changedRegions(before: string, after: string): [string, string] {
	let prefix = 0;
	const sharedLength = Math.min(before.length, after.length);
	while (prefix < sharedLength && before[prefix] === after[prefix]) prefix++;

	let suffix = 0;
	while (
		suffix < before.length - prefix
		&& suffix < after.length - prefix
		&& before[before.length - suffix - 1] === after[after.length - suffix - 1]
	) suffix++;

	return [
		before.slice(prefix, before.length - suffix),
		after.slice(prefix, after.length - suffix),
	];
}

function boundedChanges(
	changes: Change[] | undefined,
	beforeChanged: string,
	afterChanged: string,
	measure: (value: string) => number,
): ChangeCount {
	if (changes) return countChanges(changes, measure);
	return { added: measure(afterChanged), removed: measure(beforeChanged) };
}

export function countWords(value: string): number {
	return value.trim() ? value.trim().split(/\s+/u).length : 0;
}

export function countLines(value: string): number {
	if (!value) return 0;
	const breaks = value.match(/\n/gu)?.length ?? 0;
	return breaks + (value.endsWith('\n') ? 0 : 1);
}

export function calculateMetrics(before: string, after: string, timeout = 50): MetricCounts {
	const [beforeChanged, afterChanged] = changedRegions(before, after);
	const options = { timeout };
	return {
		words: boundedChanges(diffWordsWithSpace(before, after, options), beforeChanged, afterChanged, countWords),
		lines: boundedChanges(diffLines(before, after, options), beforeChanged, afterChanged, countLines),
		characters: boundedChanges(diffChars(before, after, options), beforeChanged, afterChanged, value => Array.from(value).length),
	};
}
