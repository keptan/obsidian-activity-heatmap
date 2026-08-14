import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import { renderHeatmapControls } from './controls';
import type EditHistoryPlugin from './main';

export class EditHistorySettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: EditHistoryPlugin) { super(app, plugin); }

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [{
			name: 'Edit history heatmap',
			aliases: ['Activity type', 'Measure', 'Clear cache'],
			render: setting => {
				setting.settingEl.empty();
				setting.settingEl.addClass('edit-history-settings-root');
				this.renderSettings(setting.settingEl);
			},
		}];
	}

	private renderSettings(container: HTMLElement): void {
		renderHeatmapControls(container, this.plugin, () => this.plugin.refreshViews());
	}
}
