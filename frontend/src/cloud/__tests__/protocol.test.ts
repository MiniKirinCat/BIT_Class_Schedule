import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleSnapshot } from '../../types';
import {
  CloudLoadError,
  buildCloudConfig,
  decryptSnapshotEnvelope,
  isSnapshotKey,
  loadCloudSnapshot,
  maskSnapshotUrl,
  parseCloudHash,
  saveCloudCache,
  validateSnapshot,
} from '../protocol';

vi.stubGlobal('crypto', webcrypto);

const KEY_BYTES = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const KEY = b64url(KEY_BYTES);

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '0.1.0',
  synced_at: '2026-10-27T12:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-09-07',
  courses: [
    {
      course_code: 'MATH101',
      course_name: '高等数学',
      teacher: '李老师',
      room: 'A101',
      campus: '良乡',
      weekday: 1,
      start_period: 1,
      end_period: 2,
      weeks: [8],
      raw_time_text: '周一第1-2节',
    },
  ],
  changes: [],
  calendar: [{ date: '2026-10-27', week: 8, weekday: 2 }],
  period_times: [{ index: 1, start: '08:00', end: '08:45' }],
};

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encrypt(payload: unknown, key = KEY): Promise<Record<string, unknown>> {
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cryptoKey,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    format: 'next-class-snapshot',
    version: 1,
    alg: 'A256GCM',
    nonce: b64url(nonce),
    ciphertext: b64url(new Uint8Array(ciphertext)),
    created_at: '2026-10-27T12:00:00+08:00',
  };
}

function response(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('cloud pairing config', () => {
  it('parses a QR fragment and normalizes gist URLs', () => {
    const raw =
      'https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json';
    const hash = new URLSearchParams({
      v: '1',
      snapshot: raw,
      gist: 'gist123',
      key: KEY,
    }).toString();

    expect(parseCloudHash(`#${hash}`)).toEqual({
      snapshotUrl: raw,
      gistId: 'gist123',
      key: KEY,
    });
    expect(parseCloudHash('#v=2')).toBeNull();
    expect(parseCloudHash('#v=1&snapshot=https://x&gist=g&key=short')).toBeNull();

    const config = buildCloudConfig(
      'https://gist.github.com/alice/gist123',
      KEY,
    );
    expect(config?.snapshotUrl).toBe(raw);
    expect(config?.gistId).toBe('gist123');
    expect(config?.snapshotUrl.startsWith('https://')).toBe(true);

    const revisionUrl = buildCloudConfig(
      'https://gist.githubusercontent.com/alice/gist123/raw/abc123/snapshot.enc.json',
      KEY,
    );
    expect(revisionUrl?.snapshotUrl).toBe(raw);
  });

  it('validates keys and masks addresses', () => {
    expect(isSnapshotKey(KEY)).toBe(true);
    expect(isSnapshotKey('short')).toBe(false);
    expect(
      maskSnapshotUrl(
        'https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json',
      ),
    ).toBe('gist.githubusercontent.com/…/snapshot.enc.json');
  });
});

describe('cloud snapshot decryption', () => {
  it('decrypts a valid AES-GCM envelope', async () => {
    const envelope = await encrypt(SNAPSHOT);
    const payload = await decryptSnapshotEnvelope(envelope, KEY);
    expect(validateSnapshot(payload)).toEqual(SNAPSHOT);
  });

  it('reports a wrong key as a decrypt error', async () => {
    const envelope = await encrypt(SNAPSHOT);
    const wrongKey = b64url(new Uint8Array(32).fill(9));
    await expect(decryptSnapshotEnvelope(envelope, wrongKey)).rejects.toMatchObject({
      kind: 'decrypt',
    });
  });

  it('rejects malformed snapshots', async () => {
    await expect(
      decryptSnapshotEnvelope({ format: 'wrong' }, KEY),
    ).rejects.toBeInstanceOf(CloudLoadError);
    expect(() => validateSnapshot({ schema_version: 2 })).toThrow(CloudLoadError);
    expect(() =>
      validateSnapshot({ ...SNAPSHOT, courses: [{ course_name: 'x' }] }),
    ).toThrow(CloudLoadError);
  });
});

describe('cloud snapshot loading', () => {
  it('fetches, decrypts and caches the raw Gist URL', async () => {
    const envelope = await encrypt(SNAPSHOT);
    const fetcher = vi.fn().mockResolvedValue(response(envelope));
    const config = {
      snapshotUrl:
        'https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json',
      gistId: 'gist123',
      key: KEY,
    };

    const result = await loadCloudSnapshot(config, {
      fetcher: fetcher as unknown as typeof fetch,
    });

    expect(result.source).toBe('network');
    expect(result.snapshot.term).toBe('2026-2027-1');
    expect(fetcher).toHaveBeenCalledWith(config.snapshotUrl, {
      cache: 'no-store',
    });

    const offline = vi.fn().mockRejectedValue(new Error('offline'));
    const cached = await loadCloudSnapshot(config, {
      fetcher: offline as unknown as typeof fetch,
    });
    expect(cached.source).toBe('cache');
    expect(cached.snapshot.courses[0].course_name).toBe('高等数学');
    expect(cached.warning).toContain('无法获取云端快照');
  });

  it('falls back to the Gist API when the raw URL fails', async () => {
    const envelope = await encrypt(SNAPSHOT);
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('cors'))
      .mockResolvedValueOnce(
        response({
          files: {
            'snapshot.enc.json': { content: JSON.stringify(envelope) },
          },
        }),
      );
    const result = await loadCloudSnapshot(
      {
        snapshotUrl:
          'https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json',
        gistId: 'gist123',
        key: KEY,
      },
      { fetcher: fetcher as unknown as typeof fetch },
    );

    expect(result.source).toBe('network');
    expect(fetcher).toHaveBeenLastCalledWith(
      'https://api.github.com/gists/gist123',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('does not use a cached snapshot when decryption fails', async () => {
    saveCloudCache(SNAPSHOT);
    const envelope = await encrypt(SNAPSHOT);
    const fetcher = vi.fn().mockResolvedValue(response(envelope));
    const wrongKey = b64url(new Uint8Array(32).fill(9));

    await expect(
      loadCloudSnapshot(
        {
          snapshotUrl:
            'https://gist.githubusercontent.com/alice/gist123/raw/snapshot.enc.json',
          gistId: 'gist123',
          key: wrongKey,
        },
        { fetcher: fetcher as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({ kind: 'decrypt' });
  });
});
