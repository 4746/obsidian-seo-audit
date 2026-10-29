import {PluginSettingTab, type App, type Setting, type SettingDefinitionItem} from 'obsidian';
import type SeoAuditPlugin from '../main';
import {cleanSettings} from './settings';
import {lengthFields} from '../types';

export class AuditSettingTab extends PluginSettingTab {
	constructor(app: App, private audit: SeoAuditPlugin) {
		super(app, audit);
	}

	/** Render callbacks preserve nested settings storage and coordinated saves. */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = this.audit.t;
		return [{
			type: 'group',
			heading: t('settings'),
			items: [
				{
					name: t('property'), desc: t('propertyHelp'),
					render: setting => {
						setting.addText(text => text
							.setValue(this.audit.data.settings.urlProperty).onChange(value => {
								this.audit.data.settings.urlProperty = value.trim() || 'url';
								this.audit.scheduleSave();
								void this.audit.reindex();
							}));
					},
				},
				{
					name: t('concurrency'), desc: t('concurrencyHelp'),
					render: setting => {
						setting.addText(text => {
							text.inputEl.type = 'number';
							text.inputEl.min = '1';
							text.inputEl.max = '20';
							text.inputEl.step = '1';
							text.setValue(String(this.audit.data.settings.concurrency)).onChange(value => {
								if (!value || !Number.isFinite(Number(value))) {
									return;
								}
								this.audit.data.settings = cleanSettings({...this.audit.data.settings, concurrency: Number(value)});
								this.audit.scheduleSave();
							});
						});
					},
				},
				{
					name: t('timeout'), desc: t('timeoutHelp'),
					render: setting => {
						setting.addText(text => {
							text.inputEl.type = 'number';
							text.inputEl.min = '1';
							text.inputEl.max = '300';
							text.setValue(String(this.audit.data.settings.timeoutMs / 1000)).onChange(value => {
								if (!value || !Number.isFinite(Number(value))) {
									return;
								}
								this.audit.data.settings = cleanSettings({...this.audit.data.settings, timeoutMs: Number(value) * 1000});
								this.audit.scheduleSave();
							});
						});
					},
				},
				{
					name: t('language'),
					render: setting => {
						setting.addDropdown(dropdown => dropdown.addOption('auto', t('auto')).addOption('en', t('english')).addOption('uk', t('ukrainian'))
							.setValue(this.audit.data.settings.language).onChange(value => {
								this.audit.data.settings.language = value === 'en' || value === 'uk' ? value : 'auto';
								this.audit.scheduleSave();
								this.audit.notify();
								this.update();
							}));
					},
				},
			],
		}, {
			type: 'group',
			heading: t('lengthRules'),
			items: [
				{ name: t('lengthRulesHelp') },
				...lengthFields.map(field => ({
					name: field,
					desc: t('recommendedLength'),
					render: (setting: Setting) => {
						setting.addText(text => {
							text.inputEl.type = 'number';
							text.inputEl.min = '1';
							text.inputEl.step = '1';
							text.setValue(String(this.audit.data.settings.lengthLimits[field])).onChange(value => {
								const limit = Number(value);
								if (!value.trim() || !Number.isSafeInteger(limit) || limit <= 0) {
									return;
								}
								this.audit.data.settings.lengthLimits[field] = limit;
								this.audit.scheduleSave();
								this.audit.notify();
							});
						});
					},
				})),
			],
		}];
	}
}
