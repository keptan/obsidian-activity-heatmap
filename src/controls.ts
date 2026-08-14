import { Setting } from 'obsidian';
import { ConfirmClearCacheModal } from './confirm-clear-modal';
import type EditHistoryPlugin from './main';

export function renderHeatmapControls(container: HTMLElement, plugin: EditHistoryPlugin, rerender: () => void): void {
	new Setting(container)
		.setName('Activity type')
		.addDropdown(dropdown => dropdown
			.addOption('changes', 'Additions and removals')
			.addOption('activity', 'Total activity')
			.setValue(plugin.settings.theme)
			.onChange(async value => {
				plugin.settings.theme = value as 'changes' | 'activity';
				await plugin.saveState();
				rerender();
			}));
	new Setting(container)
		.setName('Measure')
		.addDropdown(dropdown => dropdown
			.addOption('words', 'Words')
			.addOption('lines', 'Lines')
			.addOption('characters', 'Characters')
			.setValue(plugin.settings.metric)
			.onChange(async value => {
				plugin.settings.metric = value as 'words' | 'lines' | 'characters';
				await plugin.saveState();
				rerender();
			}));
	new Setting(container)
		.setName('Clear cache')
		.setDesc('Remove imported counts and checkpoints. Notes and sync history are not changed.')
		.addButton(button => button
			.setButtonText('Clear cache')
			.setDestructive()
			.onClick(() => new ConfirmClearCacheModal(plugin).open()));
}
