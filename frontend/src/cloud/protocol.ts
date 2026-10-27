import type { ScheduleSnapshot } from '../types';
import { readStorage, removeStorage, writeStorage } from '../lib/storage';

export interface CloudConfig {
  snapshotUrl: string;
  gistId: string;
  key: string;
}

export interface CloudCache {
  snapshot: ScheduleSnapshot;
  cachedAt: string;
}

export interface LoadedCloudSnapshot {
  snapshot: ScheduleSnapshot;
  source: 'network' | 'cache';
  cachedAt: string | null;
  warning: string;
}

export type CloudErrorKind = 'network' | 'decrypt' | 'format';

export class CloudLoadError extends Error {
  readonly kind: CloudErrorKind;

  constructor(kind: CloudErrorKind, message: string) {
    super(message);
    this.name = 'CloudLoadError';
    this.kind = kind;
  }
}

const CONFIG_KEY = 'next-class.cloud.config.v1';
const CACHE_KEY = 'next-class.cloud.cache.v1';
const SNAPSHOT_FILENAME = 'snapshot.enc.json';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSnapshotUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:') return null;
    if (url.hostname === 'gist.github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const [owner, gistId] = parts;
        return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${SNAPSHOT_FILENAME}`;
      }
    }
    if (url.hostname === 'gist.githubusercontent.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 4 && parts.includes('raw')) {
        const [owner, gistId] = parts;
        return `https://gist.githubusercontent.com/${owner}/${gistId}/raw/${parts[parts.length - 1]}`;
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isSnapshotKey(value: string): boolean {
  try {
    return decodeBase64Url(value).length === 32;
  } catch {
    return false;
  }
}

export function gistIdFromSnapshotUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    if (url.hostname === 'gist.github.com') {
      return url.pathname.split('/').filter(Boolean)[1] ?? '';
    }
    if (url.hostname === 'gist.githubusercontent.com') {
      return url.pathname.split('/').filter(Boolean)[1] ?? '';
    }
  } catch {
    return '';
  }
  return '';
}

export function isCloudConfig(value: unknown): value is CloudConfig {
  return (
    isRecord(value) &&
    typeof value.snapshotUrl === 'string' &&
    normalizeSnapshotUrl(value.snapshotUrl) !== null &&
    typeof value.gistId === 'string' &&
    typeof value.key === 'string' &&
    isSnapshotKey(value.key)
  );
}

export function parseCloudHash(hash: string): CloudConfig | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (params.get('v') !== '1') return null;
  const snapshotUrl = normalizeSnapshotUrl(params.get('snapshot') ?? '');
  const key = params.get('key')?.trim() ?? '';
  const gistId = params.get('gist')?.trim() ?? '';
  if (!snapshotUrl || !gistId || !isSnapshotKey(key)) return null;
  return { snapshotUrl, gistId, key };
}

export function buildCloudConfig(
  snapshotUrl: string,
  key: string,
  gistId = '',
): CloudConfig | null {
  const normalized = normalizeSnapshotUrl(snapshotUrl);
  if (!normalized || !isSnapshotKey(key)) return null;
  return {
    snapshotUrl: normalized,
    gistId: gistId.trim() || gistIdFromSnapshotUrl(normalized),
    key: key.trim(),
  };
}

export function readCloudConfig(): CloudConfig | null {
  const raw = readStorage(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isCloudConfig(parsed)) return null;
    return buildCloudConfig(parsed.snapshotUrl, parsed.key, parsed.gistId);
  } catch {
    return null;
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  writeStorage(CONFIG_KEY, JSON.stringify(config));
}

export function clearCloudState(): void {
  removeStorage(CONFIG_KEY);
  removeStorage(CACHE_KEY);
}

export function readCloudCache(): CloudCache | null {
  const raw = readStorage(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || typeof parsed.cachedAt !== 'string') return null;
    return {
      snapshot: validateSnapshot(parsed.snapshot),
      cachedAt: parsed.cachedAt,
    };
  } catch {
    return null;
  }
}

export function saveCloudCache(snapshot: ScheduleSnapshot): void {
  writeStorage(
    CACHE_KEY,
    JSON.stringify({
      snapshot,
      cachedAt: new Date().toISOString(),
    }),
  );
}

export function maskSnapshotUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    return `${parsed.host}/…/${parts.at(-1) ?? ''}`;
  } catch {
    return '地址无法显示';
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('base64 unavailable');
  }
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(normalized)) {
    throw new Error('invalid base64url');
  }
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export async function decryptSnapshotEnvelope(
  envelope: unknown,
  key: string,
): Promise<unknown> {
  if (
    !isRecord(envelope) ||
    envelope.format !== 'next-class-snapshot' ||
    envelope.version !== 1 ||
    envelope.alg !== 'A256GCM' ||
    typeof envelope.nonce !== 'string' ||
    typeof envelope.ciphertext !== 'string'
  ) {
    throw new CloudLoadError('format', '云端快照格式不正确');
  }

  let keyBytes: Uint8Array;
  let nonce: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    keyBytes = decodeBase64Url(key);
    nonce = decodeBase64Url(envelope.nonce);
    ciphertext = decodeBase64Url(envelope.ciphertext);
  } catch {
    throw new CloudLoadError('decrypt', '密钥格式不正确，请重新扫码');
  }
  if (keyBytes.length !== 32 || nonce.length !== 12 || ciphertext.length === 0) {
    throw new CloudLoadError('decrypt', '密钥或快照数据不完整');
  }
  if (!globalThis.crypto?.subtle) {
    throw new CloudLoadError('decrypt', '当前浏览器不支持安全解密，请更换浏览器');
  }

  let plaintext: ArrayBuffer;
  try {
    const cryptoKey = await globalThis.crypto.subtle.importKey(
      'raw',
      keyBytes,
      'AES-GCM',
      false,
      ['decrypt'],
    );
    plaintext = await globalThis.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      cryptoKey,
      ciphertext,
    );
  } catch {
    throw new CloudLoadError('decrypt', '密钥不匹配，请重新扫码');
  }

  try {
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new CloudLoadError('format', '快照内容损坏');
  }
}

function invalidSnapshot(): never {
  throw new CloudLoadError('format', '快照内容不完整或版本不受支持');
}

export function validateSnapshot(value: unknown): ScheduleSnapshot {
  if (!isRecord(value) || value.schema_version !== 1) invalidSnapshot();
  if (
    typeof value.synced_at !== 'string' ||
    Number.isNaN(Date.parse(value.synced_at)) ||
    typeof value.first_day !== 'string' ||
    typeof value.term !== 'string' ||
    typeof value.app_version !== 'string' ||
    typeof value.sync_interval_days !== 'number'
  ) {
    invalidSnapshot();
  }
  if (
    !Array.isArray(value.courses) ||
    !Array.isArray(value.changes) ||
    !Array.isArray(value.calendar) ||
    !Array.isArray(value.period_times) ||
    value.period_times.length === 0
  ) {
    invalidSnapshot();
  }

  for (const course of value.courses) {
    if (
      !isRecord(course) ||
      typeof course.course_code !== 'string' ||
      typeof course.course_name !== 'string' ||
      typeof course.teacher !== 'string' ||
      typeof course.room !== 'string' ||
      typeof course.campus !== 'string' ||
      typeof course.raw_time_text !== 'string' ||
      !Number.isInteger(course.weekday) ||
      !Number.isInteger(course.start_period) ||
      !Number.isInteger(course.end_period) ||
      !Array.isArray(course.weeks) ||
      !course.weeks.every((week) => Number.isInteger(week))
    ) {
      invalidSnapshot();
    }
  }

  for (const change of value.changes) {
    if (
      !isRecord(change) ||
      typeof change.id !== 'number' ||
      typeof change.detected_at !== 'string' ||
      typeof change.type !== 'string' ||
      typeof change.summary !== 'string'
    ) {
      invalidSnapshot();
    }
  }

  for (const entry of value.calendar) {
    if (
      !isRecord(entry) ||
      typeof entry.date !== 'string' ||
      !Number.isInteger(entry.week) ||
      !Number.isInteger(entry.weekday)
    ) {
      invalidSnapshot();
    }
  }

  for (const period of value.period_times) {
    if (
      !isRecord(period) ||
      !Number.isInteger(period.index) ||
      typeof period.start !== 'string' ||
      typeof period.end !== 'string'
    ) {
      invalidSnapshot();
    }
  }

  return value as unknown as ScheduleSnapshot;
}

async function fetchEnvelope(
  config: CloudConfig,
  fetcher: typeof fetch,
): Promise<unknown> {
  try {
    const response = await fetcher(config.snapshotUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('raw failed');
    return await response.json();
  } catch {
    // CORS or a transient raw URL failure: fall through to the Gist API.
  }

  if (config.gistId) {
    try {
      const response = await fetcher(
        `https://api.github.com/gists/${encodeURIComponent(config.gistId)}`,
        {
          cache: 'no-store',
          headers: { Accept: 'application/vnd.github+json' },
        },
      );
      if (!response.ok) throw new Error('api failed');
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.files)) {
        throw new Error('api shape');
      }
      const file = payload.files[SNAPSHOT_FILENAME];
      if (!isRecord(file) || typeof file.content !== 'string' || !file.content) {
        throw new Error('api file');
      }
      return JSON.parse(file.content) as unknown;
    } catch {
      // Both remote paths failed; the caller decides whether cache is legal.
    }
  }

  throw new CloudLoadError('network', '无法获取云端快照，请检查网络或快照地址');
}

export async function loadCloudSnapshot(
  config: CloudConfig,
  options: { fetcher?: typeof fetch } = {},
): Promise<LoadedCloudSnapshot> {
  const fetcher = options.fetcher ?? globalThis.fetch;
  try {
    if (!fetcher) throw new CloudLoadError('network', '当前浏览器无法联网');
    const envelope = await fetchEnvelope(config, fetcher);
    const snapshot = validateSnapshot(
      await decryptSnapshotEnvelope(envelope, config.key),
    );
    saveCloudCache(snapshot);
    return {
      snapshot,
      source: 'network',
      cachedAt: null,
      warning: '',
    };
  } catch (caught) {
    const error =
      caught instanceof CloudLoadError
        ? caught
        : new CloudLoadError('network', '无法获取云端快照');
    if (error.kind !== 'network') throw error;
    const cache = readCloudCache();
    if (cache) {
      return {
        snapshot: cache.snapshot,
        source: 'cache',
        cachedAt: cache.cachedAt,
        warning: error.message,
      };
    }
    throw error;
  }
}
