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

test.describe('desktop week default', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('defaults to the grid layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '周课表', exact: true }).click();
    await expect(page.locator('.week-grid')).toBeVisible();
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
