# Edit History Heatmap

See how your writing changed over time. Edit History Heatmap turns the per-file version history from Obsidian Sync into a private contribution calendar for your vault.

Choose folders and tags, switch between month and year views, and measure activity in words, lines, or characters. The plugin counts additions and removals without keeping copies of your notes' historical contents.

> [!IMPORTANT]
> Edit History Heatmap requires Obsidian Sync and currently uses an undocumented Sync history API. Obsidian may change this API without notice. The plugin does not work with third-party sync services.

## Features

- Month calendar in the sidebar and responsive month/year heatmaps in notes.
- Word, line, and character measurements.
- Activity heatmap or green-addition/red-removal theme.
- Multi-select scopes made from any combination of folders and tags.
- Folder and tag choices sorted by the number of matching Markdown files.
- Drag across days to total activity and see per-file additions and removals.
- Incremental scans that revisit files when their modification date changes.
- A device-shareable aggregate cache, with a warning before clearing it.
- No telemetry and no external services beyond Obsidian Sync.

## Getting started

1. Enable and configure the Obsidian Sync core plugin.
2. Open the command palette and run **Edit History Heatmap: Open heatmap**.
3. Select **Scope**, then choose one or more folders or tags. Select **All .md files** only if you want to scan the entire vault.
4. Close the scope menu to begin importing available history.

Opening the scope menu pauses an active scan. Selection changes remain a draft until the menu closes, so you can safely back out of an unexpectedly large scope. Your last committed scope is restored when Obsidian restarts.

The first import can take time because every available version in the chosen scope must be fetched and compared. Later scans use cached checkpoints and only revisit new or modified files. Progress appears in Obsidian's status bar.

## Embed a heatmap

Add this code block to any note for a year heatmap with month/year controls:

````markdown
```edit-history-heatmap
```
````

Start the embedded heatmap in month mode with:

````markdown
```edit-history-heatmap
month
```
````

Use the gear button on either heatmap to change the activity type or measurement.

## How history is counted

For each pair of consecutive Sync versions, the plugin computes additions and removals in memory and stores only aggregate counts. The oldest available snapshot is a baseline, not a creation event. This prevents an existing file's entire contents from being attributed to the day it first entered Sync.

History older than the earliest version retained by Obsidian Sync cannot be reconstructed. Moving or renaming a file may also affect which history Obsidian Sync exposes for that path.

## Privacy and cache

- Historical note contents are decoded temporarily in memory and are never written to the plugin cache.
- The cache stores dates, file paths, Sync version identifiers, modification checkpoints, and aggregate word/line/character counts.
- The plugin has no telemetry and makes no requests to third-party services.
- Network access is limited to the enabled Obsidian Sync core plugin.
- If Obsidian Sync is configured to sync community plugin settings, the aggregate cache can be shared between your devices.
- **Clear cache** permanently removes the derived activity data. Rebuilding it requires fetching the available Sync history again.

## Installation

Once accepted into the Obsidian Community directory, install **Edit History Heatmap** from **Settings → Community plugins → Browse**.

For beta testing, install the repository with [BRAT](https://github.com/TfTHacker/obsidian42-brat), or download `main.js`, `manifest.json`, and `styles.css` from a GitHub release and place them in:

```text
<vault>/.obsidian/plugins/edit-history-heatmap/
```

Reload Obsidian, then enable the plugin under **Community plugins**.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Before submitting a change:

```bash
npm run lint
npm test
npm run build
```

## License

[MIT](./LICENSE)
