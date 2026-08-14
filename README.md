# Edit History Heatmap

Edit History Heatmap builds a local contribution calendar from Obsidian Sync snapshots. It records aggregate word, line, and character additions and removals only. Historical note contents are decoded in memory and are never stored by the plugin.

The oldest available Sync snapshot for each file is treated as a baseline, not as a file-creation event. This avoids attributing pre-existing contents to the day a file was first uploaded or imported into Sync.

## Status

This plugin is in early development. It uses private Obsidian Sync APIs, which may change without notice.

## Privacy and storage

- No telemetry or external network services.
- The only network access is through Obsidian's enabled Sync core plugin.
- The cache contains dates, file paths, Sync version identifiers, and aggregate counts. It does not contain note text or historical snapshots.
- Plugin data can be shared through Obsidian's vault configuration sync when community plugin settings are enabled.

## Usage

Open **Edit history heatmap: Open heatmap**, then choose **Scope**. Select any combination of folders and tags, or explicitly select **All .md files**. Folder and tag counts include matching files in nested folders and tags. The scope is saved across restarts, and history scanning begins after the scope menu closes. Opening the scope menu pauses an active scan so the selection can be adjusted safely.

No history is scanned until a scope is explicitly selected. Later updates inside the selected scope are discovered from vault events and lightweight file metadata reconciliation.

The sidebar uses a month calendar. To embed a heatmap with year/month controls in a note, add:

````markdown
```edit-history-heatmap
```
````

Use `month` inside the code block to make the embedded view start in month mode.
