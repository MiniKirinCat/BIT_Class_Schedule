import { expect, test } from '@playwright/test';

test('mobile local app: today layouts, week layouts, changes, and theme', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible();

  await page.getByRole('button', { name: '布局' }).click();
  await page.getByRole('button', { name: /信息密度/ }).click();
  await expect(page.getByText('今日节数')).toBeVisible();

  await page.getByRole('button', { name: '布局' }).click();
  await page.getByRole('button', { name: /时间轴/ }).click();
  await expect(page.getByText('今日概览')).toBeVisible();

  await page.getByRole('button', { name: '周课表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '周课表' })).toBeVisible();
  await page.getByRole('button', { name: '单日' }).click();
  await expect(page.locator('.day-strip')).toBeVisible();
  await page.getByRole('button', { name: '整周' }).click();
  await expect(page.locator('.week-grid')).toBeVisible();

  await page.getByRole('button', { name: '变动' }).click();
  await expect(page.getByRole('heading', { name: '变动' })).toBeVisible();
  await expect(page.getByText(/调整/).first()).toBeVisible();

  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '雾蓝' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fog');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'fog');
  await page.getByRole('button', { name: '设置' }).click();
  await page.getByRole('button', { name: '暖纸' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
});

test('week search, keyboard navigation, and course actions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible();
  await page.keyboard.press('w');
  await expect(page.getByRole('heading', { name: '周课表' })).toBeVisible();
  await page.getByRole('button', { name: '整周' }).click();

  const search = page.getByLabel('搜索课程、教师或教室');
  await search.fill('不存在');
  await expect(page.getByText('没有找到课程')).toBeVisible();
  await page.getByRole('button', { name: '清除搜索' }).click();
  await expect(page.getByText('高等数学')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('第 10 周')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('第 9 周')).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: '今天' })).toBeVisible();
});

test('course detail offers copy and ICS download', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '周课表', exact: true }).click();
  await page.getByRole('button', { name: '整周' }).click();
  await page.locator('.course-block', { hasText: '高等数学' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '高等数学' })).toBeVisible();
  await expect(dialog.getByText('本学期安排')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '添加到日历（ICS）' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('.ics');
});

test('settings shows diagnostics, preflight, and startup controls', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '诊断' })).toBeVisible();
  await expect(page.getByText('Server酱', { exact: true })).toBeVisible();
  await expect(page.getByText('课程 4')).toBeVisible();

  await page.getByRole('button', { name: '运行环境自检' }).click();
  await expect(page.getByText(/Windows 凭据管理器：可用/)).toBeVisible();
  await expect(page.getByText(/统一身份认证：可访问/)).toBeVisible();

  await page.getByRole('button', { name: '开启开机自启' }).click();
  await expect(page.getByRole('button', { name: '关闭开机自启' })).toBeVisible();
});

test.describe('desktop week default', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('defaults to the grid layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '周课表', exact: true }).click();
    await expect(page.locator('.week-grid')).toBeVisible();
  });

  test('uses a two-column today layout on wide screens', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.today-focus-layout')).toBeVisible();
    const columns = await page
      .locator('.today-focus-layout')
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(columns.split(' ')).toHaveLength(2);
  });
});

test.describe('system dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('uses the dark token set without a manual toggle', async ({ page }) => {
    await page.goto('/');
    const background = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(background).toBe('#171a18');
  });
});
