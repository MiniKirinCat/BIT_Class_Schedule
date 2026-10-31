import { expect, test } from '@playwright/test';

test('mobile workbench, merged schedule, changes, and settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await expect(page.getByText('今日时间线')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'workbench');

  await page.locator('.bottom-nav').getByRole('button', { name: '课表', exact: true }).click();
  await expect(page.getByRole('heading', { name: '课表', exact: true })).toBeVisible();
  await expect(page.locator('.day-strip')).toBeVisible();
  await expect(page.locator('.week-board')).toBeHidden();

  await page.getByRole('tab', { name: '月', exact: true }).click();
  await expect(page.locator('.month-grid')).toBeVisible();
  await expect(page.getByText('月历', { exact: true })).toBeVisible();

  await page.getByRole('tab', { name: '学期', exact: true }).click();
  await expect(page.locator('.semester-stats')).toBeVisible();
  await expect(page.getByText('周次总览 · 课程密度')).toBeVisible();
  await page.getByRole('button', { name: '课程时间轴' }).click();
  await expect(page.locator('.timeline-grid')).toBeVisible();

  await page.locator('.bottom-nav').getByRole('button', { name: '变动' }).click();
  await expect(page.getByRole('heading', { name: '变动' })).toBeVisible();
  await expect(page.locator('.change-card').first()).toBeVisible();

  await page.locator('.bottom-nav').getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '外观' })).toBeVisible();
  await expect(page.locator('.desktop-layout-section')).toBeHidden();

  const themes = page.getByRole('group', { name: '配色主题' });
  await expect(themes).toBeVisible();
  for (const [label, value] of [
    ['青瓷', 'celadon'],
    ['雾蓝', 'mist'],
    ['绛陶', 'plum'],
  ] as const) {
    await themes.getByRole('button', { name: new RegExp(label) }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', value);
  }
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'plum');
});

test('week search and keyboard navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await page.keyboard.press('w');
  await expect(page.getByRole('heading', { name: '课表', exact: true })).toBeVisible();

  const weekLabel = page.locator('.week-label strong');
  await expect(weekLabel).toHaveText(/第 \d+ 周/);
  const firstWeek = await weekLabel.textContent();

  const search = page.getByLabel('搜索全部课程、教师、教室或校区');
  await search.fill('不存在');
  await expect(page.getByText(/没有找到「不存在」/)).toBeVisible();
  await expect(page.locator('.search-empty')).toBeVisible();
  await page.locator('.search-clear').click();
  await expect(page.locator('.search-results')).toHaveCount(0);

  await search.fill('高等数学');
  await expect(page.locator('.search-course').first()).toBeVisible();
  const session = page.locator('.search-session').first();
  await expect(session).toBeVisible();
  await session.click();
  await expect(page.locator('.search-results')).toHaveCount(0);
  await expect(page.locator('.day-strip')).toBeVisible();

  await search.blur();
  await page.keyboard.press('ArrowRight');
  await expect(weekLabel).not.toHaveText(firstWeek ?? '');
  await page.keyboard.press('ArrowLeft');
  await expect(weekLabel).toHaveText(firstWeek ?? '');

  await page.keyboard.press('t');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
});

test('switches to an archived term and back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /切换学期/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: '切换学期' })).toBeVisible();
  await dialog.getByRole('button', { name: /2025-2026-2/ }).click();

  await expect(page.getByRole('heading', { name: '学期回顾' })).toBeVisible();
  await expect(page.getByText('历史测试课').first()).toBeVisible();

  await page.getByRole('button', { name: '查看这个学期的课表' }).click();
  await expect(page.getByRole('heading', { name: '课表', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '首周' })).toBeVisible();
  await page.locator('.day-strip-button').nth(1).click();
  await expect(
    page.locator('.day-course', { hasText: '历史测试课' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /切换学期/ }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /2026-2027-1/ })
    .click();
  await page.locator('.bottom-nav').getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await expect(
    page.locator('.today-page').getByText('今日测试课').first(),
  ).toBeVisible();
});

test('settings shows diagnostics, preflight, and startup controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('.bottom-nav').getByRole('button', { name: '设置' }).click();
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '诊断' })).toBeVisible();
  await expect(page.getByText('Server酱', { exact: true })).toBeVisible();

  const diagnostics = page.locator('details.advanced-card', { hasText: '诊断' });
  await diagnostics.locator('summary').click();
  await expect(page.getByText('课程 4')).toBeVisible();

  await page.getByRole('button', { name: '运行环境自检' }).click();
  await expect(page.getByText(/Windows 凭据管理器：可用/)).toBeVisible();
  await expect(page.getByText(/统一身份认证：可访问/)).toBeVisible();

  const startupCard = page.locator('details.advanced-card', { hasText: '启动与退出' });
  await startupCard.locator('summary').click();
  await page.getByRole('button', { name: '开启开机自启' }).click();
  await expect(page.getByRole('button', { name: '关闭开机自启' })).toBeVisible();

  const aboutCard = page.locator('details.advanced-card', { hasText: '关于' });
  await aboutCard.locator('summary').click();
  await page.getByRole('button', { name: '检查更新' }).click();
  await expect(page.getByText('最新版本', { exact: true })).toBeVisible();
  await expect(page.getByText('测试发布说明')).toBeVisible();
  await expect(page.getByRole('link', { name: '打开发布页面' })).toHaveAttribute(
    'href',
    /releases\/tag\/v1\.5\.1/,
  );
});

test.describe('desktop workspace', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('keeps the sidebar navigation anchored on settings', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('.side-nav');
    const before = await nav.boundingBox();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByRole('button', { name: /切换学期/ })).toBeVisible();
    const after = await nav.boundingBox();
    expect(after?.y).toBe(before?.y);
  });

  test('collapses the sidebar and remembers it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.side-collapse')).toBeVisible();
    await page.getByRole('button', { name: '收起侧栏' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-sidebar',
      'collapsed',
    );
    await expect(page.locator('.sidebar')).toHaveCSS('width', '84px');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute(
      'data-sidebar',
      'collapsed',
    );
    await page.getByRole('button', { name: '展开侧栏' }).click();
    await expect(page.locator('html')).toHaveAttribute(
      'data-sidebar',
      'expanded',
    );
  });

  test('remembers the schedule view and week layout', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '课表', exact: true }).click();
    await page.getByRole('tab', { name: '月', exact: true }).click();
    await expect(page.locator('.month-grid')).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: '课表', exact: true }).click();
    await expect(page.locator('.month-grid')).toBeVisible();

    await page.getByRole('tab', { name: '周', exact: true }).click();
    await page.getByRole('button', { name: '单日' }).click();
    await expect(page.locator('.week-stage')).toHaveClass(/is-list/);
    await page.reload();
    await page.getByRole('button', { name: '课表', exact: true }).click();
    await expect(page.locator('.week-stage')).toHaveClass(/is-list/);
    await page.getByRole('button', { name: '整周' }).click();
    await expect(page.locator('.week-stage')).toHaveClass(/is-grid/);
  });

  test('grid schedule, focus mode, and course ICS', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
    await expect(page.locator('.right-rail')).toBeVisible();

    await page.getByRole('button', { name: '课表', exact: true }).click();
    await expect(page.locator('.week-board')).toBeVisible();
    await page.locator('.week-course', { hasText: '高等数学' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '高等数学' })).toBeVisible();
    await expect(dialog.getByText(/全部上课安排/)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: '添加到日历（ICS）' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('.ics');
    await dialog.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '专注' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'focus');
    await expect(page.locator('.right-rail')).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'focus');
    await page.getByRole('button', { name: '工作台' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-mode', 'workbench');
    await expect(page.locator('.right-rail')).toBeVisible();
  });
});

test.describe('system dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('uses the dark paper tokens without a manual toggle', async ({ page }) => {
    await page.goto('/');
    const background = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    );
    expect(background).toBe('#141713');
  });
});
