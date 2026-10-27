import { webcrypto } from 'node:crypto';
import { expect, test } from '@playwright/test';

const CLOUD_URL = 'http://127.0.0.1:17998';
const RAW_URL = 'https://gist.example/snapshot.enc.json';
const KEY_BYTES = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const KEY = Buffer.from(KEY_BYTES).toString('base64url');

function dateKeyInShanghai(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDays(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fixtureSnapshot() {
  const today = dateKeyInShanghai();
  const weekday = ((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const firstDay = addDays(today, -7 * 7);
  const calendar = Array.from({ length: 14 }, (_, index) => {
    const date = addDays(today, index);
    return {
      date,
      week: Math.floor((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 604_800_000) + 1,
      weekday: ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1,
    };
  });
  return {
    schema_version: 1,
    app_version: '0.1.0',
    synced_at: new Date().toISOString(),
    sync_interval_days: 1,
    term: '2026-2027-1',
    first_day: firstDay,
    courses: [
      {
        course_code: 'CLOUD101',
        course_name: '快照测试课',
        teacher: '云端老师',
        room: '云端楼 101',
        campus: '良乡',
        weekday,
        start_period: 3,
        end_period: 4,
        weeks: [8],
        raw_time_text: '快照测试',
      },
    ],
    changes: [
      {
        id: 1,
        detected_at: new Date().toISOString(),
        type: 'modified',
        course_code: 'CLOUD101',
        course_name: '快照测试课',
        summary: '快照测试课：调整教室 云端楼 101 → 云端楼 202',
        before: null,
        after: null,
      },
    ],
    calendar,
    period_times: [
      ['08:00', '08:45'],
      ['08:50', '09:35'],
      ['09:55', '10:40'],
      ['10:45', '11:30'],
      ['11:35', '12:20'],
      ['13:20', '14:05'],
      ['14:10', '14:55'],
      ['15:15', '16:00'],
      ['16:05', '16:50'],
      ['16:55', '17:40'],
      ['18:30', '19:15'],
      ['19:20', '20:05'],
      ['20:10', '20:55'],
    ].map(([start, end], index) => ({ index: index + 1, start, end })),
  };
}

async function encryptSnapshot(payload: unknown): Promise<Record<string, unknown>> {
  const key = await webcrypto.subtle.importKey('raw', KEY_BYTES, 'AES-GCM', false, [
    'encrypt',
  ]);
  const nonce = webcrypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return {
    format: 'next-class-snapshot',
    version: 1,
    alg: 'A256GCM',
    nonce: Buffer.from(nonce).toString('base64url'),
    ciphertext: Buffer.from(ciphertext).toString('base64url'),
    created_at: new Date().toISOString(),
  };
}

test('cloud PWA imports a QR fragment, decrypts and falls back to cache', async ({
  page,
}) => {
  const envelope = await encryptSnapshot(fixtureSnapshot());
  await page.route(RAW_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(envelope),
    }),
  );

  const hash = new URLSearchParams({
    v: '1',
    snapshot: RAW_URL,
    gist: 'gist-e2e',
    key: KEY,
  }).toString();
  await page.goto(`${CLOUD_URL}/#${hash}`);

  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible();
  expect(page.url()).not.toContain('key=');
  await expect(page.getByRole('button', { name: '周课表', exact: true })).toBeVisible();

  await page.getByRole('button', { name: '周课表', exact: true }).click();
  await expect(page.getByText('快照测试课').first()).toBeVisible();

  await page.getByRole('button', { name: '变动' }).click();
  await expect(page.getByText(/调整教室/)).toBeVisible();

  await page.getByRole('button', { name: '设备' }).click();
  await expect(page.getByText('云端最新快照')).toBeVisible();
  await page.getByRole('button', { name: '雾蓝' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fog');

  await page.route('https://gist.example/**', (route) => route.abort());
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText('正在显示缓存快照')).toBeVisible();
  await expect(page.getByText(/缓存快照 ·/)).toBeVisible();
});

test('cloud PWA shows the manual connection form without pairing data', async ({
  page,
}) => {
  await page.goto(CLOUD_URL);
  await expect(page.getByRole('heading', { name: '连接快照' })).toBeVisible();
  await expect(page.getByLabel('快照地址')).toBeVisible();
  await expect(page.getByLabel('解密密钥')).toBeVisible();
});
