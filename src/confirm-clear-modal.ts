import { Modal, Setting } from 'obsidian';
import type EditHistoryPlugin from './main';

export class ConfirmClearCacheModal extends Modal {
	constructor(private plugin: EditHistoryPlugin) { super(plugin.app); }

	onOpen(): void {
		this.setTitle('Clear edit history cache?');
		this.contentEl.createEl('p', {
			text: 'This removes all imported aggregate counts and scan checkpoints from the shared plugin cache. Your notes and Obsidian Sync history are not affected. You will need to scan history again to restore the heatmap.',
		});
		const actions = new Setting(this.contentEl);
		actions.addButton(button => button
			.setButtonText('Cancel')
			.onClick(() => this.close()));
		actions.addButton(button => button
			.setButtonText('Clear cache')
			.setDestructive()
			.onClick(async () => {
				await this.plugin.clearCache();
				this.close();
			}));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
