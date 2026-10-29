import { PluginSettingTab, Setting, type App } from 'obsidian';
import type SeoAuditPlugin from './main';
import { cleanSettings } from './storage';

export class AuditSettingTab extends PluginSettingTab {
  constructor(app: App, private audit: SeoAuditPlugin) { super(app, audit); }
  display(): void {
    const { containerEl } = this; containerEl.empty();
    const t = this.audit.t;
    containerEl.createEl('h2', { text: t('settings') });
    new Setting(containerEl).setName(t('property')).setDesc(t('propertyHelp')).addText(text => text
      .setPlaceholder('url').setValue(this.audit.data.settings.urlProperty).onChange(value => {
        this.audit.data.settings.urlProperty = value.trim() || 'url'; this.audit.scheduleSave(); void this.audit.reindex();
      }));
    new Setting(containerEl).setName(t('concurrency')).setDesc(t('concurrencyHelp')).addText(text => {
      text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '20'; text.inputEl.step = '1';
      text.setValue(String(this.audit.data.settings.concurrency)).onChange(value => {
        if (!value || !Number.isFinite(Number(value))) return;
        this.audit.data.settings = cleanSettings({ ...this.audit.data.settings, concurrency: Number(value) }); this.audit.scheduleSave();
      });
    });
    new Setting(containerEl).setName(t('timeout')).setDesc(t('timeoutHelp')).addText(text => {
      text.inputEl.type = 'number'; text.inputEl.min = '1'; text.inputEl.max = '300';
      text.setValue(String(this.audit.data.settings.timeoutMs / 1000)).onChange(value => {
        if (!value || !Number.isFinite(Number(value))) return;
        this.audit.data.settings = cleanSettings({ ...this.audit.data.settings, timeoutMs: Number(value) * 1000 }); this.audit.scheduleSave();
      });
    });
    new Setting(containerEl).setName(t('language')).addDropdown(dropdown => dropdown.addOption('auto', t('auto')).addOption('en', 'English').addOption('uk', 'Українська')
      .setValue(this.audit.data.settings.language).onChange(value => {
        this.audit.data.settings.language = value === 'en' || value === 'uk' ? value : 'auto';
        this.audit.scheduleSave(); this.audit.notify(); this.display();
      }));
  }
}
