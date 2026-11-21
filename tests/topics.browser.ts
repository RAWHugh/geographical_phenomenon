import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { guideStorageKey } from '../src/guide';

const pixels = (canvas: Locator) => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
const frameHashes = (maps: Locator[]) => Promise.all(maps.map(async map => createHash('sha256').update(await pixels(map)).digest('hex')));

test('loads ocean on a fresh visit and synchronizes months, color mode and location', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#ocean');
  const chart = page.getByLabel(/全球洋流地图/);
  await expect(chart).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '流向动画' })).toBeDisabled();
  const point = page.getByRole('region', { name: '观测点', exact: true });
  await expect(point).toContainText('20.4 °C');
  const first = await pixels(chart);
  await page.getByRole('button', { name: '7 月', exact: true }).click();
  await expect(point).toContainText('27.6 °C');
  await expect.poll(() => pixels(chart)).not.toBe(first);
  await page.getByRole('button', { name: '海表温度', exact: true }).click();
  await expect(page.getByRole('button', { name: '海表温度', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '湾流' }).click();
  await expect(page.getByTestId('topic-position')).toHaveText('37° N · 72° W');
  await chart.click({ position: { x: .64 * (await chart.boundingBox())!.width, y: .23 * (await chart.boundingBox())!.height } });
  await expect(point).toContainText('该网格无浮标气候态数据');
});

test('updates both atmospheric plots with the selected pressure level and seasonal frame', async ({ page }) => {
  await page.goto('/#atmosphere');
  const low = page.getByLabel(/850 hPa 全球风场地图/);
  const high = page.getByLabel(/200 hPa 全球风场地图/);
  const section = page.getByRole('img', { name: /平均经向环流剖面/ });
  await expect(low).toBeVisible();
  const first = await pixels(low);
  await page.getByRole('button', { name: '200 hPa 高层' }).click();
  await expect(high).toBeVisible();
  await expect(section).toHaveAccessibleName(/200 hPa/);
  await expect.poll(() => pixels(high)).not.toBe(first);
  const january = await pixels(section);
  await page.getByRole('button', { name: '7 月', exact: true }).click();
  await expect.poll(() => pixels(section)).not.toBe(january);
  await page.getByRole('button', { name: '850 hPa 低层' }).click();
  const box = (await low.boundingBox())!;
  await low.click({ position: { x: box.width * .75, y: box.height / 3 } });
  await expect(page.getByRole('region', { name: '等压面观测点' })).toContainText('月均地面以下');
});

test('moves the reconstruction and schematic with the timeline and supports rotation', async ({ page }) => {
  await page.goto('/#mountains');
  const canvas = page.getByLabel(/板块重建地球/);
  await expect(canvas).toBeVisible();
  const positions = page.getByTestId('plate-positions');
  const initial = await positions.textContent();
  await page.getByRole('button', { name: '50 Ma', exact: true }).click();
  await expect(page.getByTestId('orogeny-stage')).toHaveText('大陆开始碰撞');
  await expect(positions).not.toHaveText(initial!);
  await page.getByRole('button', { name: '0 Ma', exact: true }).click();
  await expect(positions).toContainText('22° N · 78° E');
  await expect(page.getByTestId('orogeny-stage')).toHaveText('地壳缩短与增厚');
  await page.getByRole('button', { name: '定位印度－欧亚' }).click();
  const current = await pixels(canvas);
  await canvas.press('ArrowRight');
  await expect.poll(() => pixels(canvas)).not.toBe(current);
});

test('links climate maps and profiles, with mobile controls and missing elevation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#climate');
  const profile = page.getByLabel(/气温、降水和陆地高程剖面/);
  await expect(profile).toBeVisible();
  await expect(page.getByTestId('cut-value')).toHaveText('105° E');
  await expect(page.getByTestId('profile-values')).toContainText('mm/月');
  const values = await page.getByTestId('profile-values').textContent();
  await page.getByRole('button', { name: '7 月', exact: true }).click();
  await expect(page.getByTestId('profile-values')).not.toHaveText(values!);
  await page.getByRole('button', { name: '欧亚 40°N' }).click();
  await expect(page.getByTestId('cut-value')).toHaveText('40° N');
  await page.getByRole('slider').press('ArrowUp');
  await expect(page.getByTestId('cut-value')).toHaveText('41° N');
  const map = page.getByLabel(/全球气候地图/);
  const box = (await map.boundingBox())!;
  await map.click({ position: { x: box.width * .14, y: box.height * .5 } });
  await expect(page.getByTestId('cut-value')).toHaveText('0°');
  await expect(page.getByTestId('profile-values')).toContainText('高程 —');
  const position = page.getByTestId('topic-position');
  const longitudeBefore = Number((await position.textContent())?.match(/(\d+)° W/)?.[1]);
  await profile.press('ArrowRight');
  await expect(position).toHaveText(`0° · ${longitudeBefore - 1}° W`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test('retries an unavailable topic, then plays and pauses while retaining the solar date', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'seen'), guideStorageKey);
  await page.goto('/');
  await page.getByRole('button', { name: '冬至', exact: true }).first().click();
  const date = page.getByLabel('当地日期', { exact: true });
  const solarDate = await date.inputValue();
  const nav = page.getByRole('navigation', { name: '地理专题' });
  await page.route('**/data/ocean.f32', route => route.fulfill({ status: 503 }), { times: 1 });
  await nav.getByRole('link', { name: '洋流', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('专题数据加载失败');
  await page.getByRole('button', { name: '重试' }).click();
  const cursor = page.getByTestId('topic-time');
  await expect(cursor).toHaveText('1 月');
  await page.getByLabel('专题播放速度').selectOption('420');
  await page.getByRole('button', { name: '播放专题时间轴' }).click();
  await expect(cursor).not.toHaveText('1 月');
  await page.getByRole('button', { name: '暂停专题播放' }).click();
  await expect(page.getByRole('button', { name: '播放专题时间轴' })).toBeVisible();
  await page.goBack();
  await expect(date).toHaveValue(solarDate);
});

test('shows three seasonal maps together and redraws them from one month selection', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, 'seen'), guideStorageKey);
  await page.goto('/');
  const tab = page.getByRole('link', { name: '季节对比', exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-current', 'page');
  const maps = [/近表层洋流地图/, /大气环流地图/, /气候降水地图/].map(name => page.getByLabel(name));
  for (const map of maps) await expect(map).toBeInViewport({ ratio: 1 });
  const ocean = page.getByRole('region', { name: '近表层洋流', exact: true });
  await expect(ocean).toContainText('0.76 m/s');
  const january = await frameHashes(maps);
  await page.getByRole('button', { name: '7 月', exact: true }).click();
  await expect(page.getByTestId('topic-time')).toHaveText('7 月');
  await expect(ocean).toContainText('0.92 m/s');
  await expect.poll(async () => (await frameHashes(maps)).map((hash, i) => hash !== january[i]))
    .toEqual([true, true, true]);

  const july = await frameHashes(maps);
  await page.getByRole('button', { name: '200 hPa' }).click();
  await expect.poll(async () => (await frameHashes(maps)).map((hash, i) => hash !== july[i]))
    .toEqual([false, true, false]);

  const beforePick = await frameHashes(maps);
  await maps[2].press('Shift+ArrowLeft');
  await expect(page.getByTestId('comparison-position')).toHaveText('33° N · 125° E');
  await expect.poll(async () => (await frameHashes(maps)).map((hash, i) => hash !== beforePick[i]))
    .toEqual([true, true, true]);
});

test('advances the seasonal maps as one frame and keeps them paused together', async ({ page }) => {
  await page.goto('/#compare');
  const play = page.getByRole('button', { name: '播放全年', exact: true });
  const pause = page.getByRole('button', { name: '暂停专题播放', exact: true });
  const month = page.getByTestId('topic-time');
  const maps = [/近表层洋流地图/, /大气环流地图/, /气候降水地图/].map(name => page.getByLabel(name));
  for (const map of maps) await expect(map).toBeInViewport();
  const time = new Date('2026-01-01T00:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 60_000));
  const january = await frameHashes(maps);
  await page.getByLabel('专题播放速度').selectOption('420');
  await play.click();
  await page.clock.runFor(420);
  await expect(month).toHaveText('2 月');
  await expect.poll(async () => (await frameHashes(maps)).map((hash, i) => hash !== january[i]))
    .toEqual([true, true, true]);
  await pause.click();
  const february = await frameHashes(maps);
  await page.clock.runFor(1_000);
  await expect(month).toHaveText('2 月');
  expect(await frameHashes(maps)).toEqual(february);

  await page.getByRole('button', { name: '11 月', exact: true }).click();
  await play.click();
  await page.clock.runFor(420);
  await expect(month).toHaveText('12 月');
  await expect(play).toBeVisible();
  await play.click();
  await expect(month).toHaveText('1 月');
});

test('recovers a failed seasonal dataset and fits three compact maps on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.route('**/data/climate.f32', route => route.fulfill({ status: 503 }), { times: 1 });
  await page.goto('/#compare');
  await expect(page.getByRole('alert')).toContainText('季节对比数据加载失败');
  await expect(page.getByTestId('topic-time')).toHaveCount(0);
  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.getByTestId('topic-time')).toHaveText('1 月');
  for (const name of [/近表层洋流地图/, /大气环流地图/, /气候降水地图/]) {
    await expect(page.getByLabel(name)).toBeInViewport({ ratio: 1 });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});
