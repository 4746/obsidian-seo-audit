import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ScanProgressNotice } from '../src/ui/scan-progress-notice';
import { Notice } from './obsidian-mock';
import { translator } from '../src/i18n';

beforeEach(() => {
  Notice.instances = [];
  vi.stubGlobal('createDiv', () => document.createElement('div'));
  vi.stubGlobal('createFragment', (build: (fragment: DocumentFragment) => void) => {
    const fragment = document.createDocumentFragment();
    build(fragment);
    return fragment;
  });
});
afterEach(() => vi.unstubAllGlobals());

it('shows one live notification during a scan and hides it when scanning stops', () => {
  const stop = vi.fn();
  const popup = new ScanProgressNotice(() => translator('uk', 'uk'), stop);
  const idle = { running: false, completed: 0, total: 0, active: 0 };
  popup.update(idle);
  expect(Notice.instances).toHaveLength(0);
  popup.update({ running: true, completed: 0, total: 10, active: 3 });
  expect(Notice.instances).toHaveLength(1);
  const notice = Notice.instances[0]!;
  expect(notice.duration).toBe(0);
  expect(notice.messageEl.textContent).toContain('Перевірено 0 з 10');
  popup.update({ running: true, completed: 4, total: 10, active: 2 });
  expect(Notice.instances).toHaveLength(1);
  expect(notice.messageEl.querySelector('progress')!.value).toBe(4);
  expect(notice.messageEl.textContent).toContain('Перевірено 4 з 10');
  notice.messageEl.querySelector('button')!.click();
  expect(stop).toHaveBeenCalledOnce();
  popup.update({ ...idle, completed: 4, total: 10 });
  expect(notice.hidden).toBe(true);
  popup.update({ running: true, completed: 0, total: 1, active: 1 });
  expect(Notice.instances).toHaveLength(2);
  popup.hide();
  expect(Notice.instances[1]!.hidden).toBe(true);
});

it('updates the active notification language without creating another popup', () => {
  let t = translator('en', 'en');
  const popup = new ScanProgressNotice(() => t, () => {});
  const state = { running: true, completed: 2, total: 5, active: 1 };
  popup.update(state);
  t = translator('uk', 'en');
  popup.update(state);
  expect(Notice.instances).toHaveLength(1);
  expect(Notice.instances[0]!.messageEl.textContent).toContain('Перевірено 2 з 5');
  popup.hide();
});
