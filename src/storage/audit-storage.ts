import {fieldKeys, isStringField, type AuditResult, type PluginData} from '../types';
import {cleanSettings} from '../settings/settings';
import {codePointLength} from '../utils/string-length';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function validValues(value: unknown): boolean {
	return Array.isArray(value) && value.every(v => object(v) && typeof v.value === 'string' && typeof v.length === 'number' && v.length === codePointLength(v.value));
}

export function validResult(v: unknown): v is AuditResult {
	if (!object(v) || typeof v.url !== 'string' || typeof v.scannedAt !== 'string' || !Number.isFinite(Date.parse(v.scannedAt))) {
		return false;
	}
	if (v.finalUrl !== null && typeof v.finalUrl !== 'string') {
		return false;
	}
	if (v.status !== null && (typeof v.status !== 'number' || !Number.isInteger(v.status) || v.status < 100 || v.status > 599)) {
		return false;
	}
	if (v.responseTimeMs !== null && (typeof v.responseTimeMs !== 'number' || !Number.isFinite(v.responseTimeMs) || v.responseTimeMs < 0)) {
		return false;
	}
	if (!validValues(v.xRobotsTag)) {
		return false;
	}
	if (v.error !== null && (!object(v.error) || !['network', 'timeout', 'invalid-response', 'non-html', 'parse', 'http'].includes(String(v.error.kind)) || typeof v.error.message !== 'string')) {
		return false;
	}
	if (v.metadata === null) {
		return true;
	}
	const m = v.metadata;
	return object(m) && (m.lang === null || typeof m.lang === 'string') && object(m.fields) && fieldKeys.every(k => {
			const values = (m.fields as Record<string, unknown>)[k];
			return isStringField(k) ? Array.isArray(values) && values.every(value => typeof value === 'string') : validValues(values);
		}) && validValues(m.h1)
		&& m.h1Count === (m.h1 as unknown[]).length && object(m.alternates)
		&& Object.values(m.alternates).every(value => typeof value === 'string' || (Array.isArray(value) && value.length > 0 && value.every(href => typeof href === 'string')));
}

export function loadData(raw: unknown): PluginData {
	if (raw == null) {
		return {
			schemaVersion: 1,
			settings: cleanSettings(null),
			cache: {schemaVersion: 2, latest: Object.create(null) as Record<string, AuditResult>}
		};
	}
	if (!object(raw) || raw.schemaVersion !== 1 || !object(raw.cache) || raw.cache.schemaVersion !== 2 || !object(raw.cache.latest)) {
		throw new Error('Unsupported or invalid SEO Audit data schema. Existing data was not overwritten.');
	}
	const latest: Record<string, AuditResult> = Object.create(null) as Record<string, AuditResult>;
	for (const [url, value] of Object.entries(raw.cache.latest)) {
		if (!validResult(value) || value.url !== url) {
			throw new Error('Invalid SEO Audit cache. Existing data was not overwritten.');
		}
		latest[url] = value;
	}
	return {schemaVersion: 1, settings: cleanSettings(raw.settings), cache: {schemaVersion: 2, latest}};
}

/** Serialize saves so a slower older write cannot replace newer data. */
export class SaveQueue {
	private pending: Promise<void> = Promise.resolve();

	constructor(private write: (data: PluginData) => Promise<void>) {
	}

	save(data: PluginData): Promise<void> {
		const snapshot = JSON.parse(JSON.stringify(data)) as PluginData;
		const next = this.pending.catch(() => undefined).then(() => this.write(snapshot));
		this.pending = next;
		return next;
	}
}

/** Coalesces cache/settings updates and owns the persistence lifecycle. */
export class AuditStorage {
	private saves: SaveQueue;
	private timer: number | undefined;
	private dirty = false;
	private disposed = false;

	constructor(readonly data: PluginData, write: (data: PluginData) => Promise<void>, private onError: (error: unknown) => void) {
		this.saves = new SaveQueue(write);
	}

	scheduleSave(): void {
		this.dirty = true;
		if (this.timer !== undefined || this.disposed) {
			return;
		}
		this.timer = window.setTimeout(() => {
			this.timer = undefined;
			void this.flush();
		}, 1500);
	}

	async flush(): Promise<void> {
		if (!this.dirty) {
			return;
		}
		this.dirty = false;
		try {
			await this.saves.save(this.data);
		} catch (error) {
			this.dirty = true;
			this.onError(error);
		}
	}

	/** Queue an empty cache after pending writes, retaining all plugin settings. */
	async clearResults(): Promise<void> {
		this.data.cache.latest = Object.create(null) as Record<string, AuditResult>;
		this.scheduleSave();
		await this.flush();
	}

	dispose(): void {
		this.disposed = true;
		window.clearTimeout(this.timer);
		void this.flush();
	}
}
