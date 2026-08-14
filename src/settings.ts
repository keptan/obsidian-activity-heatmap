import { App, PluginSettingTab, Setting, type SettingDefinitionItem } from 'obsidian';
import type EditHistoryPlugin from './main';

export class EditHistorySettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: EditHistoryPlugin) { super(app, plugin); }

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			name: 'Edit history heatmap',
			aliases: ['Heatmap theme', 'Default measure', 'Activity color', 'Concurrent files'],
			render: setting => {
				setting.settingEl.empty();
				this.renderSettings(setting.settingEl);
			},
		}];
	}

	private renderSettings(container: HTMLElement): void {
		new Setting(container)
			.setName('Heatmap theme')
			.setDesc('Show additions and removals separately, or combine them as total activity.')
			.addDropdown(dropdown => dropdown
				.addOption('changes', 'Additions and removals')
				.addOption('activity', 'Total activity')
				.setValue(this.plugin.settings.theme)
				.onChange(async value => {
					this.plugin.settings.theme = value as 'changes' | 'activity';
					await this.plugin.saveState();
					this.plugin.refreshViews();
				}));
		new Setting(container)
			.setName('Default measure')
			.addDropdown(dropdown => dropdown
				.addOption('words', 'Words')
				.addOption('lines', 'Lines')
				.addOption('characters', 'Characters')
				.setValue(this.plugin.settings.metric)
				.onChange(async value => {
					this.plugin.settings.metric = value as 'words' | 'lines' | 'characters';
					await this.plugin.saveState();
					this.plugin.refreshViews();
				}));
		new Setting(container)
			.setName('Activity color')
			.setDesc('Color used by the total activity theme.')
			.addColorPicker(picker => picker.setValue(this.plugin.settings.activityColor).onChange(async value => {
				this.plugin.settings.activityColor = value;
				await this.plugin.saveState();
				this.plugin.refreshViews();
			}));
		new Setting(container)
			.setName('Concurrent files')
			.setDesc('Keep this low to avoid placing unnecessary load on sync.')
			.addDropdown(dropdown => dropdown
				.addOption('1', '1')
				.addOption('2', '2')
				.addOption('3', '3')
				.addOption('4', '4')
				.setValue(String(this.plugin.settings.maxConcurrentFiles))
				.onChange(async value => {
					this.plugin.settings.maxConcurrentFiles = Number(value);
					await this.plugin.saveState();
				}));
	}
}
