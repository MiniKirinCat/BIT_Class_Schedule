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
  const now = new Date().toISOString();
  const archivedAt = new Date(Date.now() - 150 * 86_400_000).toISOString();
  const historyFirstDay = addDays(firstDay, -120);

  return {
    schema_version: 2,
    app_version: '1.4.0',
    synced_at: now,
    sync_interval_days: 1,
    current_term: '2026-2027-1',
    terms: [
      {
        term: '2026-2027-1',
        first_day: firstDay,
        fetched_at: now,
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
            id: 2,
            detected_at: now,
            type: 'modified',
            course_code: 'CLOUD101',
            course_name: '快照测试课',
            summary: '快照测试课：调整教室 云端楼 101 → 云端楼 202',
            before: null,
            after: null,
          },
        ],
        calendar,
      },
      {
        term: '2025-2026-2',
        first_day: historyFirstDay,
        fetched_at: archivedAt,
        courses: [
          {
            course_code: 'HIST101',
            course_name: '历史快照课',
            teacher: '历史老师',
            room: '旧教学楼 201',
            campus: '中关村',
            weekday: 2,
            start_period: 1,
            end_period: 2,
            weeks: [1],
            raw_time_text: '历史学期测试',
          },
        ],
        changes: [
          {
            id: 1,
            detected_at: archivedAt,
            type: 'added',
            course_code: 'HIST101',
            course_name: '历史快照课',
            summary: '新增：周二 1-2 节 历史快照课 · 旧教学楼 201',
            before: null,
            after: null,
          },
        ],
        calendar: [],
      },
    ],
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

  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  expect(page.url()).not.toContain('key=');
  await expect(
    page.locator('.bottom-nav').getByRole('button', { name: '课表', exact: true }),
  ).toBeVisible();

  await page.locator('.bottom-nav').getByRole('button', { name: '课表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '课表', exact: true })).toBeVisible();
  await expect(
    page.locator('.day-course', { hasText: '快照测试课' }),
  ).toBeVisible();

  await page.locator('.bottom-nav').getByRole('button', { name: '变动' }).click();
  await expect(page.locator('.change-diff').first()).toContainText('调整教室');

  await page.locator('.bottom-nav').getByRole('button', { name: '设备' }).click();
  await expect(page.getByText('云端最新快照')).toBeVisible();
  await expect(page.getByText(/2 个学期/)).toBeVisible();
  await expect(page.getByText('离线应用壳', { exact: true })).toBeVisible();
  const themes = page.getByRole('group', { name: '配色主题' });
  await expect(themes).toBeVisible();
  await themes.getByRole('button', { name: /青瓷/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'celadon');
  await page.getByRole('button', { name: '专注' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'focus');
  await page.getByRole('button', { name: '工作台' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'workbench');

  await page.route('https://gist.example/**', (route) => route.abort());
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.reload();
  await expect(page.getByText('正在显示缓存快照')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'celadon');
});

test('cloud PWA switches to an archived term and back', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /切换学期/ }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '切换学期' })).toBeVisible();
  await dialog.getByRole('button', { name: /2025-2026-2/ }).click();

  await expect(page.getByRole('heading', { name: '学期回顾' })).toBeVisible();
  await expect(page.getByText('历史快照课').first()).toBeVisible();
  await page.getByRole('button', { name: '查看这个学期的课表' }).click();
  await expect(page.getByRole('heading', { name: '课表', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '首周' })).toBeVisible();
  await page.locator('.day-strip-button').nth(1).click();
  await expect(
    page.locator('.day-course', { hasText: '历史快照课' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /切换学期/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /2026-2027-1/ }).click();
  await page.locator('.bottom-nav').getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await expect(
    page.locator('.today-page').getByText('快照测试课').first(),
  ).toBeVisible();
});

test('cloud PWA opens the cached shell when offline', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();

  await page.route('https://gist.example/**', (route) => route.abort());
  await page.route('https://api.github.com/**', (route) => route.abort());
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByText('正在显示缓存快照')).toBeVisible();
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await page.context().setOffline(false);
});

test('cloud PWA shows the manual connection form without pairing data', async ({
  page,
}) => {
  await page.goto(CLOUD_URL);
  await expect(page.getByRole('heading', { name: '连接快照' })).toBeVisible();
  await expect(page.getByLabel('快照地址')).toBeVisible();
  await expect(page.getByLabel('解密密钥')).toBeVisible();
});
