import { expect, it, vi } from 'vitest';
import type { App, Setting, SettingDefinitionGroup, SettingDefinitionRender, SettingGroup } from 'obsidian';
import type SeoAuditPlugin from '../src/main';
import { AuditSettingTab } from '../src/settings/settings-tab';
import { loadData } from '../src/storage/audit-storage';
import { translator } from '../src/i18n';

vi.mock('obsidian', () => ({
  PluginSettingTab: class {
    update = vi.fn();
  },
}));

function setup() {
  const data = loadData(null);
  const plugin = {
    data,
    get t() { return translator(data.settings.language, 'en'); },
    scheduleSave: vi.fn(), reindex: vi.fn(), notify: vi.fn(),
  };
  const tab = new AuditSettingTab({} as App, plugin as unknown as SeoAuditPlugin);
  const definitions = () => (tab.getSettingDefinitions()[0] as SettingDefinitionGroup).items as SettingDefinitionRender[];
  function control(index: number) {
    let change = (_value: string) => {};
    const input = {
      inputEl: document.createElement('input'),
      value: '',
      setValue(value: string) { this.value = value; return this; },
      addOption() { return this; },
      onChange(callback: (value: string) => void) { change = callback; return this; },
    };
    const setting = {
      addText: (build: (text: typeof input) => void) => build(input),
      addDropdown: (build: (dropdown: typeof input) => void) => build(input),
    };
    definitions()[index]!.render(setting as unknown as Setting, {} as SettingGroup);
    return { input, change: (value: string) => change(value) };
  }
  return { data, plugin, tab, definitions, control };
}

it('builds searchable definitions without saving or reindexing', () => {
  const s = setup();
  expect(s.definitions().map(def => def.name)).toHaveLength(4);
  expect(s.plugin.scheduleSave).not.toHaveBeenCalled();
  expect(s.plugin.reindex).not.toHaveBeenCalled();
  expect(s.control(0).input.value).toBe('url');
  s.control(0).change(' published ');
  expect(s.data.settings.urlProperty).toBe('published');
  expect(s.plugin.reindex).toHaveBeenCalledOnce();
  s.control(0).change(' ');
  expect(s.data.settings.urlProperty).toBe('url');
  expect(s.plugin.scheduleSave).toHaveBeenCalledTimes(2);
});

it('preserves numeric validation, bounds and timeout conversion', () => {
  const s = setup();
  for (const index of [1, 2]) {
    const control = s.control(index);
    expect(control.input.inputEl.type).toBe('number');
    control.change(''); control.change('invalid'); control.change('Infinity');
  }
  expect(s.plugin.scheduleSave).not.toHaveBeenCalled();
  s.control(1).change('21'); expect(s.data.settings.concurrency).toBe(20);
  s.control(1).change('2.6'); expect(s.data.settings.concurrency).toBe(3);
  s.control(2).change('2.5'); expect(s.data.settings.timeoutMs).toBe(2500);
  s.control(2).change('301'); expect(s.data.settings.timeoutMs).toBe(300000);
  s.control(2).change('0'); expect(s.data.settings.timeoutMs).toBe(1000);
  expect(s.plugin.scheduleSave).toHaveBeenCalledTimes(5);
});

it('saves language, notifies views and updates translated definitions', () => {
  const s = setup();
  s.control(3).change('uk');
  expect(s.data.settings.language).toBe('uk');
  expect(s.definitions()[0]!.name).toBe('URL-властивість frontmatter');
  expect(s.plugin.scheduleSave).toHaveBeenCalledOnce();
  expect(s.plugin.notify).toHaveBeenCalledOnce();
  expect(s.tab.update).toHaveBeenCalledOnce();
  s.control(3).change('unsupported');
  expect(s.data.settings.language).toBe('auto');
});
