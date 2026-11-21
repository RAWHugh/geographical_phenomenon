import { expect, test } from '@playwright/test';
import { guideSteps, guideStorageKey, seasonalGuide } from '../src/guide';

test('first visit walks through the eight guide steps and remembers completion', async ({ page }, info) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('开始探索日照地理');
  await expect(dialog.getByRole('heading')).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), guideStorageKey)).toBeNull();
  await dialog.getByRole('button', { name: '开始逐步引导' }).click();
  await expect(dialog).toHaveAccessibleName('选择观测地点');
  await dialog.getByRole('button', { name: '上一步' }).click();
  await expect(dialog).toHaveAccessibleName('开始探索日照地理');
  await dialog.getByRole('button', { name: '开始逐步引导' }).click();

  for (const [index, step] of guideSteps.entries()) {
    await expect(dialog).toHaveAccessibleName(step.title);
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', String(index + 1));
    await expect(dialog.locator('.guide-spotlight')).toBeVisible();
    if (step.id === 'orbit') {
      await expect(page.locator('#orbital-view')).toBeVisible();
      await page.screenshot({ path: info.outputPath('guide-orbit.png') });
    }
    if (step.id === 'comparison') {
      await expect(page.getByTestId('annual-value-B')).toBeVisible();
      await page.screenshot({ path: info.outputPath('guide-comparison.png') });
    }
    if (index < guideSteps.length - 1) await dialog.getByRole('button', { name: '下一步' }).click();
  }
  await dialog.getByRole('button', { name: '完成引导' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: '使用引导' })).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByTestId('comparison-place-name')).toHaveCount(0);
  await expect(page.locator('#orbital-view')).toHaveCount(0);
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-06-21');
  expect(await page.evaluate(key => localStorage.getItem(key), guideStorageKey)).toBe('seen');
  await page.reload();
  await expect(page.getByRole('heading', { name: '日照地理' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
});

test('can skip on first visit and replay without changing selected places or date', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '直接探索' }).click();
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await page.getByLabel('地点预设', { exact: true }).selectOption('特罗姆瑟');
  await page.getByRole('button', { name: '添加对比地点' }).click();
  await page.getByLabel('对比地点预设').selectOption('悉尼');
  await page.getByRole('button', { name: '冬至', exact: true }).click();
  const button = page.getByRole('button', { name: '使用引导' });
  await button.click();
  await expect(dialog).toHaveAccessibleName('开始探索日照地理');
  await dialog.getByRole('button', { name: '开始逐步引导' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.getByTestId('place-name')).toHaveText('特罗姆瑟');
  await expect(page.getByTestId('comparison-place-name')).toHaveText('悉尼');
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
});

test('seasonal guide highlights each control and pauses playback without changing the comparison', async ({ page }) => {
  await page.goto('/#compare');
  const launch = page.getByRole('button', { name: '使用引导' });
  const dialog = page.getByRole('dialog');
  await expect(launch).toBeEnabled();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '7 月', exact: true }).click();
  await page.getByRole('button', { name: '200 hPa', exact: true }).click();
  await page.getByLabel(/气候降水地图/).press('Shift+ArrowLeft');
  const time = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
  await page.getByRole('button', { name: '播放全年', exact: true }).click();
  await launch.click();
  await expect(dialog).toHaveAccessibleName(seasonalGuide.title);
  await dialog.getByRole('button', { name: '开始逐步引导' }).click();
  for (const [index, step] of seasonalGuide.steps.entries()) {
    await expect(dialog).toHaveAccessibleName(step.title);
    await expect(dialog.getByRole('progressbar')).toHaveAttribute('value', String(index + 1));
    await expect(dialog.locator('.guide-spotlight')).toBeVisible();
    if (index < seasonalGuide.steps.length - 1) await dialog.getByRole('button', { name: '下一步' }).click();
  }
  await page.clock.runFor(2_000);
  await dialog.getByRole('button', { name: '完成引导' }).click();
  await expect(launch).toBeFocused();
  await expect(page.getByRole('button', { name: '播放全年', exact: true })).toBeVisible();
  await expect(page.getByTestId('topic-time')).toHaveText('7 月');
  await expect(page.getByTestId('comparison-position')).toHaveText('33° N · 125° E');
  await expect(page.getByRole('button', { name: '200 hPa', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await launch.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(launch).toBeFocused();
});

test.describe('mobile guide', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('keeps navigation and the spotlight visible in portrait and landscape', async ({ page }, info) => {
    await page.goto('/');
    const dialog = page.getByRole('dialog');
    await page.screenshot({ path: info.outputPath('guide-welcome-mobile.png') });
    await dialog.getByRole('button', { name: '开始逐步引导' }).tap();
    for (const step of guideSteps.slice(0, 4)) {
      await expect(dialog).toHaveAccessibleName(step.title);
      await expect(dialog.locator('.guide-spotlight')).toBeVisible();
      await dialog.getByRole('button', { name: '下一步' }).tap();
    }
    await expect(dialog).toHaveAccessibleName('观察地轴和公转位置');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => dialog.locator('.guide-card').evaluate(card => {
      const rect = card.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    })).toBe(true);
    const next = dialog.getByRole('button', { name: '下一步' });
    await next.tap();
    await expect(dialog).toHaveAccessibleName('比较两地的全年昼长');
    await next.tap();
    await expect(dialog).toHaveAccessibleName('同屏播放全年变化');
    await next.tap();
    await expect(dialog).toHaveAccessibleName('切换专题与季节对比');
    await dialog.getByRole('link', { name: '前往季节对比' }).tap();
    await expect(page).toHaveURL(/#compare$/);
    await expect(dialog).toHaveCount(0);
    const launch = page.getByRole('button', { name: '使用引导' });
    await expect(launch).toBeEnabled();
    await launch.tap();
    await dialog.getByRole('button', { name: '开始逐步引导' }).tap();
    for (const step of seasonalGuide.steps) {
      await expect(dialog).toHaveAccessibleName(step.title);
      await expect(dialog.locator('.guide-spotlight')).toBeVisible();
      await expect(dialog.locator('.guide-card')).toBeInViewport({ ratio: 1 });
      if (step !== seasonalGuide.steps.at(-1)) await next.tap();
    }
    await dialog.getByRole('button', { name: '完成引导' }).tap();
    await expect(launch).toBeFocused();
  });
});
