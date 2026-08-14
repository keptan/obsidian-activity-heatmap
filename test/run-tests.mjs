import assert from 'node:assert/strict';
import { build, transform } from 'esbuild';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

globalThis.window = globalThis;

const source = await fs.readFile(new URL('../src/metrics.ts', import.meta.url), 'utf8');
assert.match(source, /diffWordsWithSpace/);
assert.match(source, /diffLines/);
assert.match(source, /diffChars/);

const cacheSource = await fs.readFile(new URL('../src/cache.ts', import.meta.url), 'utf8');
await transform(source, { loader: 'ts', format: 'esm' });
await transform(cacheSource, { loader: 'ts', format: 'esm' });

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'edit-history-test-'));
const bundle = path.join(tempDir, 'metrics.mjs');
await build({ entryPoints: [new URL('../src/metrics.ts', import.meta.url).pathname], outfile: bundle, bundle: true, platform: 'node', format: 'esm' });
const { calculateMetrics } = await import(bundle);
const counts = calculateMetrics('one two\nold line\n', 'one three four\nnew line\n');
assert.deepEqual(counts.words, { added: 3, removed: 2 });
assert.ok(counts.lines.added > 0);
assert.ok(counts.lines.removed > 0);
assert.ok(counts.characters.added > 0);
assert.ok(counts.characters.removed > 0);
const fallbackCounts = calculateMetrics('prefix old words suffix', 'prefix new text suffix', -1);
assert.deepEqual(fallbackCounts.words, { added: 2, removed: 2 });

const indexerBundle = path.join(tempDir, 'indexer.mjs');
await build({ entryPoints: [new URL('../src/indexer.ts', import.meta.url).pathname], outfile: indexerBundle, bundle: true, platform: 'node', format: 'esm' });
const { HistoryIndexer } = await import(indexerBundle);
const versions = [
	{ uid: 2, ts: new Date('2026-01-02T12:00:00').getTime(), path: 'Note.md', size: 7, device: 'test', deleted: false, folder: false },
	{ uid: 1, ts: new Date('2026-01-01T12:00:00').getTime(), path: 'Note.md', size: 3, device: 'test', deleted: false, folder: false },
];
const content = new Map([[1, 'one'], [2, 'one two'], [3, 'one two three']]);
const client = {
	async listVersions(_path, stopAtUid) {
		if (stopAtUid === 2) return { versions: [{ ...versions[0], uid: 3, ts: new Date('2026-01-03T12:00:00').getTime() }, versions[0]], foundStop: true };
		return { versions, foundStop: false };
	},
	async readVersion(uid) { return content.get(uid); },
};
const cache = { schemaVersion: 1, trackingStartedAt: 0, clearedAt: 0, transitions: {}, checkpoints: {} };
const file = { path: 'Note.md', stat: { mtime: 10 } };
const indexer = new HistoryIndexer(client, cache);
assert.equal(await indexer.indexFile(file, true), 1);
assert.equal(Object.keys(cache.transitions).length, 1);
assert.deepEqual(cache.transitions['2'].counts.words, { added: 1, removed: 0 });
file.stat.mtime = 20;
assert.equal(await indexer.indexFile(file), 1);
assert.equal(Object.keys(cache.transitions).length, 2);
assert.deepEqual(cache.transitions['3'].counts.words, { added: 1, removed: 0 });

const progressCache = { schemaVersion: 1, trackingStartedAt: 0, clearedAt: 0, transitions: {}, checkpoints: {} };
const progressIndexer = new HistoryIndexer(client, progressCache);
const progress = [];
await progressIndexer.indexFiles([{ ...file, path: 'One.md' }, { ...file, path: 'Two.md' }], 2, update => progress.push(update));
assert.ok(progress.some(update => update.activePaths.length === 2));
assert.equal(progress.at(-1).completedFiles, 2);
assert.equal(progress.at(-1).versions, 2);
assert.ok(progress.every((update, index) => index === 0 || update.versions >= progress[index - 1].versions));
await fs.rm(tempDir, { recursive: true });

const styles = await fs.readFile(new URL('../styles.css', import.meta.url), 'utf8');
assert.equal(styles.includes('!important'), false);

console.log('Source smoke tests passed');
