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

Open **Edit history heatmap: Open heatmap**, then select **Import history** for the initial historical scan. Later updates are discovered from vault events and lightweight file metadata reconciliation.
