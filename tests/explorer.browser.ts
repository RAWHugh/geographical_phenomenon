import { expect, test } from '@playwright/test';
import type { Locator } from '@playwright/test';
import { guideStorageKey } from '../src/guide';

test.use({
  storageState: {
    cookies: [],
    origins: [{ origin: 'http://127.0.0.1:4199', localStorage: [{ name: guideStorageKey, value: 'seen' }] }],
  },
});

async function globeCenterPixel(globe: Locator) {
  const screenshot = await globe.screenshot();
  return globe.page().evaluate(async (uri) => {
    const image = new Image();
    image.src = uri;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1, 0, 0, 1, 1);
    const [red, green, blue] = ctx.getImageData(0, 0, 1, 1).data;
    return { red, green, blue };
  }, `data:image/png;base64,${screenshot.toString('base64')}`);
}

async function presentationFits(dialog: Locator) {
  return dialog.evaluate(surface => {
    const plots = ['.earth-stage canvas', '.orbit-picture canvas', '.annual-canvas'];
    const fit = plots.every(selector => {
      const rect = surface.querySelector(selector)?.getBoundingClientRect();
      return rect && rect.width > 140 && rect.height > 65 && rect.top >= 0 && rect.left >= 0
        && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1;
    });
    const chart = surface.querySelector('.annual-scroll')!;
    return fit && surface.scrollHeight <= surface.clientHeight + 1
      && surface.scrollWidth <= surface.clientWidth + 1 && chart.scrollWidth <= chart.clientWidth + 1;
  });
}

test('3D, 2D, location, both charts and solar terms share one observation', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '日照地理' })).toBeVisible();
  const globe = page.getByRole('img', { name: /3D 地球/ });
  await expect(globe).toBeVisible();
  await expect.poll(() => globe.evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(300);
  await expect(page.getByTestId('current-altitude')).toHaveText('73.2°');
  await expect(page.getByTestId('transit')).toHaveText(/12:16/);
  await page.screenshot({ path: info.outputPath('desktop.png'), fullPage: true });

  await page.getByRole('button', { name: '冬至', exact: true }).click();
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-12-22');
  const sun = await page.getByTestId('subsolar').textContent();
  expect(sun).toContain('23.44°S');
  await page.getByRole('button', { name: '2D 地图' }).click();
  const map = page.getByRole('img', { name: /2D 世界地图/ });
  await expect(map).toBeVisible();
  await expect(page.getByTestId('subsolar')).toHaveText(sun!);
  await page.getByLabel('地点预设').selectOption('纽约');
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-12-21');
  await expect(page.getByTestId('current-zone')).toContainText('UTC-05:00');
  await expect(page.getByTestId('subsolar')).toHaveText(sun!);

  await page.getByRole('button', { name: '全年正午' }).click();
  const yearChart = page.getByRole('img', { name: /全年太阳上中天/ });
  await yearChart.click({ position: { x: 150, y: 68 } });
  const atTransit = await page.getByLabel('当地时刻').inputValue();
  await expect(page.getByTestId('transit')).toContainText(atTransit.slice(0, 5));
  await page.getByRole('button', { name: '日内变化', exact: true }).click();
  const dayChart = page.getByRole('img', { name: /日内太阳高度角/ });
  await dayChart.press('ArrowRight');
  await expect(page.getByLabel('当地时刻')).not.toHaveValue(atTransit);
  const beforePick = await page.getByTestId('subsolar').textContent();
  await map.click();
  await expect(page.getByTestId('place-name')).toHaveText('地图选点');
  await expect(page.getByTestId('subsolar')).toHaveText(beforePick!);
  await page.getByRole('button', { name: '3D 地球' }).click();
  await expect(globe).toBeVisible();
  await expect(page.getByTestId('place-name')).toHaveText('地图选点');
  await expect(page.getByTestId('subsolar')).toHaveText(beforePick!);
  const mapCoordinates = await page.getByTestId('observer-coordinates').textContent();
  await expect.poll(() => globe.evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(300);
  await globe.click();
  await expect(page.getByTestId('subsolar')).toHaveText(beforePick!);
  await expect(page.getByTestId('observer-coordinates')).not.toHaveText(mapCoordinates!);
  await globe.evaluate(element => {
    const context = (element as HTMLCanvasElement).getContext('webgl2')!;
    context.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(map).toBeVisible();
  await expect(page.getByTestId('subsolar')).toHaveText(beforePick!);
  expect(errors).toEqual([]);
});

test('uses local day lengths and lets the user choose either repeated time', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('地点预设').selectOption('纽约');
  await page.getByLabel('当地日期', { exact: true }).fill('2026-03-08');
  await page.getByLabel('当地时刻').fill('02:30:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('被跳过');
  await page.getByLabel('当地时刻').fill('03:30:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  const slider = page.getByRole('slider', { name: '日内时间轴' });
  await expect(slider).toHaveAttribute('max', '1379');
  await page.getByLabel('当地日期', { exact: true }).fill('2026-11-01');
  await page.getByLabel('当地时刻').fill('01:30:00');
  await page.getByRole('button', { name: '应用', exact: true }).click();
  await expect(page.getByRole('button', { name: 'UTC-04:00' })).toBeVisible();
  await page.getByRole('button', { name: 'UTC-05:00' }).click();
  await expect(slider).toHaveAttribute('max', '1499');
  await expect(page.getByTestId('current-zone')).toContainText('UTC-05:00');
});

test('plays a day and supports clicking an ordinary solar term and overriding a time zone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '播放日内变化' }).click();
  await expect(page.getByLabel('当地时刻')).not.toHaveValue('12:00:00');
  await page.getByRole('button', { name: '暂停播放' }).click();
  const paused = await page.getByLabel('当地时刻').inputValue();
  await expect(page.getByLabel('当地时刻')).toHaveValue(paused);
  await page.getByRole('button', { name: /^立春 \d/ }).click();
  await expect(page.getByTestId('active-term')).toHaveText('立春');
  const sun = await page.getByTestId('subsolar').textContent();
  await page.getByText('经纬度与时区', { exact: true }).click();
  await page.getByLabel('IANA 时区').fill('UTC');
  await page.getByRole('button', { name: '应用观测点' }).click();
  await expect(page.getByTestId('iana-zone')).toHaveText('UTC');
  await expect(page.getByTestId('subsolar')).toHaveText(sun!);
});

test('links the orbit, day-night map and solar altitude in both directions', async ({ page }, info) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '公转视图' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  const orbit = page.getByRole('region', { name: '地球公转' });
  const picture = orbit.getByRole('img');
  await expect(orbit).toBeVisible();
  await expect(page.getByTestId('orbit-tilt')).toHaveText('23.44°');
  await page.getByRole('button', { name: '冬至', exact: true }).click();
  await expect(picture).toHaveAccessibleName(/90.0 度，南极向阳倾斜/);
  await expect(page.getByTestId('subsolar')).toContainText('23.44°S');
  const winterAltitude = await page.getByTestId('current-altitude').textContent();
  await orbit.getByRole('button', { name: '公转轨道上的夏至' }).click();
  await expect(page.getByTestId('active-term')).toHaveText('夏至');
  await expect(picture).toHaveAccessibleName(/270.0 度，北极向阳倾斜/);
  await expect(page.getByTestId('subsolar')).toContainText('23.44°N');
  await expect(page.getByTestId('current-altitude')).not.toHaveText(winterAltitude!);
  await page.screenshot({ path: info.outputPath('orbit.png'), fullPage: true });

  await page.getByRole('button', { name: '2D 地图' }).click();
  await expect(page.getByRole('img', { name: /2D 世界地图/ })).toBeVisible();
  await expect(picture).toHaveAccessibleName(/270.0 度/);
  await toggle.click();
  await expect(orbit).toHaveCount(0);
  await expect(page.getByTestId('active-term')).toHaveText('夏至');
});

test('shows the selected local day and opposite polar seasons in sync with the orbit and map', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '公转视图' }).click();
  const daylight = page.getByTestId('daylight-duration');
  const regime = page.getByTestId('daylight-state');
  await expect(regime).toHaveText('昼夜交替');
  await expect(daylight).toHaveText(/14 小时 [45]\d 分/);
  await expect(page.getByText('几何日出', { exact: true })).toBeVisible();
  await expect(page.getByText('几何日落', { exact: true })).toBeVisible();

  await page.getByLabel('地点预设').selectOption('特罗姆瑟');
  await page.getByRole('button', { name: '夏至', exact: true }).click();
  await expect(daylight).toHaveText('24 小时');
  await expect(regime).toHaveText('极昼');
  await expect(page.getByTestId('orbit-hemisphere')).toHaveText('北极向阳倾斜');
  await expect(page.getByTestId('subsolar')).toContainText('23.44°N');
  await page.screenshot({ path: info.outputPath('polar-day.png'), fullPage: true });

  await page.getByRole('button', { name: '公转轨道上的冬至' }).click();
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
  await expect(page.getByTestId('orbit-hemisphere')).toHaveText('南极向阳倾斜');
  await expect(page.getByTestId('subsolar')).toContainText('23.44°S');
  await expect(daylight).toHaveText('0 小时');
  await expect(regime).toHaveText('极夜');
  await page.getByLabel('地点预设').selectOption('南极点');
  await expect(page.getByTestId('daylight-state')).toHaveText('极昼');
  await expect(daylight).toHaveText('24 小时');
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
});

test('draws both seasonal polar caps in 2D and on the rotating 3D globe', async ({ page }, info) => {
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '极昼极夜范围' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '公转视图' }).click();
  const map = page.getByRole('img', { name: /2D 世界地图/ });
  const readMapColors = () => map.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const height = Math.min(rect.width - 32, (rect.height - 30) * 2) / 2;
    const ctx = canvas.getContext('2d')!;
    const x = Math.round(canvas.width * .44);
    return [82, -82].map(lat => {
      const y = Math.round((rect.height / 2 - lat * height / 180) * canvas.height / rect.height);
      const [red, , blue] = ctx.getImageData(x, y, 1, 1).data;
      return red - blue;
    });
  });
  await page.getByRole('button', { name: '夏至', exact: true }).click();
  await expect(page.getByTestId('polar-day-limit')).toHaveText('北纬 66.56° 以北');
  await expect(page.getByTestId('polar-night-limit')).toHaveText('南纬 66.56° 以南');
  await expect.poll(async () => {
    const [north, south] = await readMapColors();
    return north > 10 && south < -20;
  }).toBe(true);

  await page.getByRole('button', { name: '公转轨道上的冬至' }).click();
  await expect(page.getByTestId('polar-day-limit')).toHaveText('南纬 66.56° 以南');
  await expect(page.getByTestId('polar-night-limit')).toHaveText('北纬 66.56° 以北');
  await expect.poll(async () => {
    const [north, south] = await readMapColors();
    return north < -20 && south > 10;
  }).toBe(true);
  await page.screenshot({ path: info.outputPath('polar-map.png'), fullPage: true });

  await page.getByRole('button', { name: '3D 地球' }).click();
  const globe = page.getByRole('img', { name: /3D 地球/ });
  await expect.poll(() => globe.evaluate(element => (element as HTMLCanvasElement).width)).toBeGreaterThan(300);
  for (let step = 0; step < 7; step++) await globe.press('ArrowUp');
  const winter = await globeCenterPixel(globe);
  expect(winter.blue).toBeGreaterThan(95);
  expect(winter.blue - winter.red).toBeGreaterThan(20);
  await page.getByRole('button', { name: '夏至', exact: true }).click();
  const summer = await globeCenterPixel(globe);
  expect(summer.red - summer.blue).toBeGreaterThan(10);
  await page.screenshot({ path: info.outputPath('polar-globe.png'), fullPage: true });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const uncolored = await globeCenterPixel(globe);
  expect(uncolored.red).toBeLessThan(summer.red - 15);
  await toggle.click();
  for (let step = 0; step < 20; step++) await globe.press('ArrowDown');
  const south = await globeCenterPixel(globe);
  expect(south.blue).toBeGreaterThan(95);
  expect(south.blue - south.red).toBeGreaterThan(20);
  await page.getByRole('button', { name: '春分', exact: true }).click();
  await expect(page.getByTestId('polar-equinox')).toBeVisible();
  await expect(page.getByTestId('polar-day-limit')).toHaveCount(0);
});

test('plots the local year with 24 terms and links date selection to all views', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '公转视图' }).click();
  await page.getByLabel('地点预设').selectOption('特罗姆瑟');
  await page.getByRole('link', { name: '全年曲线' }).click();
  const chart = page.getByRole('region', { name: '全年昼长' });
  const plot = chart.getByRole('img', { name: /全年每日昼长曲线/ });
  const orbit = page.getByRole('region', { name: '地球公转' }).getByRole('img');
  await expect(plot).toBeVisible();
  await expect(chart.getByRole('button', { name: /^全年曲线 / })).toHaveCount(24);
  await expect(chart.getByTestId('annual-polar-day-dates')).toHaveText(/5 月 \d+ 日 至 7 月 \d+ 日/);
  await expect(chart.getByTestId('annual-polar-night-dates')).toContainText('2025 年');
  await expect(chart.getByTestId('annual-polar-night-dates')).toContainText('2027 年');
  const initialSun = await page.getByTestId('subsolar').textContent();
  const initialOrbit = await orbit.getAttribute('aria-label');
  const width = (await plot.boundingBox())!.width;
  const index = 50;
  await plot.click({ position: { x: 44 + (index + .5) / 365 * (width - 44 - 23), y: 132 } });
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-02-20');
  await expect(page.getByTestId('subsolar')).not.toHaveText(initialSun!);
  await expect(orbit).not.toHaveAttribute('aria-label', initialOrbit!);
  const clock = await page.getByLabel('当地时刻').inputValue();
  await expect(page.getByTestId('transit')).toContainText(clock.slice(0, 5));
  await plot.press('ArrowRight');
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-02-21');

  await chart.getByRole('button', { name: /^全年曲线 冬至/ }).click();
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
  await expect(page.getByTestId('daylight-state')).toHaveText('极夜');
  await expect(chart.getByText('0 小时', { exact: true })).toBeVisible();
  await chart.screenshot({ path: info.outputPath('annual-daylight.png') });

  await page.getByLabel('地点预设').selectOption('南极点');
  await expect(chart.getByText('24 小时', { exact: true })).toBeVisible();
  await expect(chart.getByTestId('annual-polar-day-dates')).toContainText('2025 年');
  await expect(chart.getByTestId('annual-polar-day-dates')).toContainText('2027 年');
  await expect(page.getByTestId('daylight-duration')).toHaveText('24 小时');
});

test('compares two observers, including opposing polar dates and different civil dates', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '公转视图' }).click();
  const firstPlace = page.getByLabel('地点预设', { exact: true });
  const secondPlace = page.getByLabel('对比地点预设', { exact: true });
  await firstPlace.selectOption('特罗姆瑟');
  await page.getByRole('button', { name: '添加对比地点' }).click();
  await expect(secondPlace).toHaveValue('南极点');
  await page.getByRole('button', { name: '夏至', exact: true }).click();
  const chart = page.getByRole('region', { name: '全年昼长' });
  const plot = chart.getByRole('img', { name: /两地全年昼长曲线/ });
  await expect(chart.getByTestId('annual-value-A')).toHaveText('24 小时');
  await expect(chart.getByTestId('annual-value-B')).toHaveText('0 小时');
  await expect(chart.getByTestId('annual-polar-day-dates')).toHaveText(/5 月 \d+ 日 至 7 月 \d+ 日/);
  await expect(chart.getByTestId('annual-comparison-polar-day-dates')).toContainText('2027 年');
  await expect(chart.getByTestId('annual-comparison-polar-night-dates')).toHaveText(/3 月 \d+ 日 至 9 月 \d+ 日/);
  await chart.getByRole('button', { name: /^全年曲线 冬至/ }).click();
  await expect(chart.getByTestId('annual-value-A')).toHaveText('0 小时');
  await expect(chart.getByTestId('annual-value-B')).toHaveText('24 小时');
  await expect(page.getByTestId('orbit-hemisphere')).toHaveText('南极向阳倾斜');
  await expect(page.getByTestId('subsolar')).toContainText('23.44°S');
  await chart.screenshot({ path: info.outputPath('comparison-annual.png') });

  await firstPlace.selectOption('北京');
  await secondPlace.selectOption('纽约');
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-12-22');
  await expect(page.getByTestId('comparison-local-time')).toHaveText('当地 2026-12-21 15:50');

  const map = page.getByRole('img', { name: /2D 世界地图.*A 点/ });
  await expect.poll(() => map.evaluate(element => {
    const canvas = element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const width = Math.min(rect.width - 32, (rect.height - 30) * 2);
    const ctx = canvas.getContext('2d')!;
    return [[39.9042, 116.4074], [40.7128, -74.006]].map(([lat, lon]) => {
      const x = (rect.width / 2 + lon / 360 * width) * canvas.width / rect.width;
      const y = (rect.height / 2 - lat / 360 * width) * canvas.height / rect.height;
      return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data].slice(0, 3);
    });
  })).toEqual([[142, 230, 220], [255, 167, 178]]);
  await expect(chart.getByTestId('annual-value-A')).toContainText('9 小时');
  await expect(chart.getByTestId('annual-value-B')).toContainText('9 小时');
  await page.screenshot({ path: info.outputPath('comparison-map.png'), fullPage: true });

  const width = (await plot.boundingBox())!.width;
  await plot.click({ position: { x: 44 + .5 / 365 * (width - 44 - 23), y: 150 } });
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-01-01');
  await expect(page.getByTestId('comparison-local-time')).toContainText('2025-12-31');
  await expect(page.getByTestId('orbit-hemisphere')).toHaveText('南极向阳倾斜');

  await page.getByRole('button', { name: '3D 地球' }).click();
  const globe = page.getByRole('img', { name: /3D 地球.*B 点/ });
  await expect(globe).toBeVisible();
  await page.getByRole('button', { name: '居中 B 点' }).click();
  await expect.poll(async () => {
    const pixel = await globeCenterPixel(globe);
    return pixel.red > 235 && pixel.green < 185 && pixel.blue > 162;
  }).toBe(true);

  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '点选 B 点' }).click();
  await map.click();
  await expect(page.getByTestId('comparison-place-name')).toHaveText('地图选点');
  await expect(page.getByTestId('place-name')).toHaveText('北京');
  await page.getByText('对比点经纬度与时区', { exact: true }).click();
  await page.getByLabel('对比点纬度', { exact: true }).fill('-33.8688');
  await page.getByLabel('对比点经度', { exact: true }).fill('151.2093');
  await page.getByLabel('对比点 IANA 时区', { exact: true }).fill('Australia/Sydney');
  await page.getByRole('button', { name: '应用对比地点' }).click();
  await expect(page.getByTestId('comparison-iana-zone')).toHaveText('Australia/Sydney');
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-01-01');

  await secondPlace.selectOption('北京');
  await expect(chart.getByTestId('annual-value-B')).toHaveText((await chart.getByTestId('annual-value-A').textContent())!);
  await page.getByRole('button', { name: '关闭两地对比' }).click();
  await expect(page.getByTestId('comparison-place-name')).toHaveCount(0);
  await expect(chart.getByRole('img', { name: /全年每日昼长曲线/ })).toBeVisible();
});

test('plays the year one local day at a time with shared speed, pause and seasonal views', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '公转视图' }).click();
  await page.getByLabel('地点预设', { exact: true }).selectOption('特罗姆瑟');
  await page.getByRole('button', { name: '添加对比地点' }).click();
  await page.getByRole('button', { name: '春分', exact: true }).click();
  const date = page.getByLabel('当地日期', { exact: true });
  const time = page.getByLabel('当地时刻', { exact: true });
  const clock = await time.inputValue();
  const orbit = page.getByRole('region', { name: '地球公转' }).getByRole('img');
  const initialOrbit = await orbit.getAttribute('aria-label');
  const chart = page.getByRole('region', { name: '全年昼长' });
  const cursor = chart.getByTestId('annual-cursor-date');
  await expect(chart.getByTestId('annual-value-B')).toBeVisible();
  await expect(page.getByTestId('polar-equinox')).toBeVisible();
  await chart.getByLabel('曲线播放速度').selectOption('1');
  await chart.getByRole('button', { name: '播放全年曲线' }).click();
  const pause = page.getByRole('button', { name: '暂停全年播放' });
  await expect(pause).toBeVisible();
  const topRate = page.getByLabel('全年播放速度');
  await expect(topRate).toHaveValue('1');
  await page.clock.runFor(999);
  await expect(date).toHaveValue('2026-03-20');
  await page.clock.runFor(1);
  await expect(date).toHaveValue('2026-03-21');
  await expect(time).toHaveValue(clock);
  await expect(cursor).toHaveAttribute('datetime', '2026-03-21');
  await expect(chart.getByTestId('annual-value-A')).toBeVisible();
  await expect(chart.getByTestId('annual-value-B')).toHaveText('0 小时');
  await expect(page.getByTestId('polar-day-limit')).toContainText('北纬');
  await expect(orbit).not.toHaveAttribute('aria-label', initialOrbit!);
  await expect(page.getByTestId('comparison-local-time')).toContainText('2026-03-21');
  await page.screenshot({ path: info.outputPath('year-playing.png'), fullPage: true });

  await topRate.selectOption('4');
  await expect(chart.getByLabel('曲线播放速度')).toHaveValue('4');
  await page.clock.runFor(750);
  await expect(date).toHaveValue('2026-03-24');
  await chart.getByRole('button', { name: '暂停全年曲线' }).click();
  await page.clock.runFor(1_500);
  await expect(date).toHaveValue('2026-03-24');
  await expect(cursor).toHaveAttribute('datetime', '2026-03-24');
  await page.getByRole('button', { name: '下一天' }).click();
  await expect(date).toHaveValue('2026-03-25');

  const slider = page.getByRole('slider', { name: '全年日期轴' });
  await slider.press('End');
  await slider.press('ArrowLeft');
  await expect(date).toHaveValue('2026-12-30');
  const play = page.getByRole('button', { name: '播放全年变化' });
  await play.click();
  await page.clock.runFor(250);
  await expect(date).toHaveValue('2026-12-31');
  await expect(play).toBeVisible();
  await page.clock.runFor(1_000);
  await expect(date).toHaveValue('2026-12-31');
  await play.click();
  await expect(date).toHaveValue('2026-01-01');
  await page.clock.runFor(250);
  await expect(date).toHaveValue('2026-01-02');
  await page.getByRole('button', { name: '冬至', exact: true }).click();
  await expect(play).toBeVisible();
  await expect(page.getByTestId('active-term')).toHaveText('冬至');
});

test('presents all three live views in native fullscreen and returns to the same playback', async ({ page }, info) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: '2D 地图' }).click();
  await page.getByRole('button', { name: '春分', exact: true }).click();
  await page.getByLabel('曲线播放速度').selectOption('1');
  await page.getByRole('button', { name: '播放全年曲线' }).click();
  const entry = page.getByRole('button', { name: '从全年曲线打开全屏演示' });
  await entry.click();
  const dialog = page.getByRole('dialog', { name: '全屏演示' });
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute('aria-label'))).toBe('全屏演示');
  await expect(dialog.getByRole('region', { name: '全球昼夜' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: '地球公转' })).toBeVisible();
  await expect(dialog.getByTestId('annual-value-B')).toBeVisible();
  await expect(dialog.getByRole('button', { name: '暂停演示' })).toBeVisible();
  await expect.poll(() => presentationFits(dialog)).toBe(true);
  await expect(dialog.getByTestId('presentation-date')).toContainText('2026-03-20');
  const orbit = dialog.getByRole('region', { name: '地球公转' }).getByRole('img');
  const originalOrbit = await orbit.getAttribute('aria-label');
  await page.clock.runFor(1_000);
  await expect(dialog.getByTestId('presentation-date')).toContainText('2026-03-21');
  await expect(dialog.getByTestId('annual-cursor-date')).toHaveAttribute('datetime', '2026-03-21');
  await expect(dialog.getByTestId('polar-day-limit')).toBeVisible();
  await expect(orbit).not.toHaveAttribute('aria-label', originalOrbit!);
  await dialog.getByRole('button', { name: '暂停演示' }).click();
  await page.clock.runFor(2_000);
  await expect(dialog.getByTestId('presentation-date')).toContainText('2026-03-21');
  await dialog.getByLabel('演示播放速度').selectOption('4');
  await dialog.getByRole('button', { name: '播放演示' }).click();
  await page.clock.runFor(250);
  await expect(dialog.getByTestId('presentation-date')).toContainText('2026-03-22');
  await page.screenshot({ path: info.outputPath('presentation-desktop.png') });

  await page.evaluate(() => document.exitFullscreen());
  await expect(dialog).toHaveCount(0);
  await expect(entry).toBeFocused();
  await expect(page.getByRole('button', { name: '添加对比地点' })).toBeVisible();
  await expect(page.getByRole('region', { name: '地球公转' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '暂停全年播放' })).toBeVisible();
  await page.clock.runFor(250);
  await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-03-23');
});

test.describe('touch layout', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('falls back to the interactive 2D map on mobile without WebGL', async ({ page }, info) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: unknown[]) {
        if (args[0] === 'webgl2') return null;
        return Reflect.apply(original, this, args);
      } as typeof original;
    });
    await page.goto('/');
    const map = page.getByRole('img', { name: /2D 世界地图/ });
    await expect(map).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: '已切换到 2D' })).toBeVisible();
    await expect(page.getByRole('button', { name: '3D 地球' })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.getByTestId('current-altitude')).toHaveText('73.2°');
    await expect(page.getByTestId('daylight-state')).toHaveText('昼夜交替');
    await page.screenshot({ path: info.outputPath('mobile.png'), fullPage: true });
    await map.tap();
    await expect(page.getByTestId('place-name')).toHaveText('地图选点');
    await page.getByRole('button', { name: '春分', exact: true }).tap();
    await expect(page.getByTestId('active-term')).toHaveText('春分');
    const pixels = await map.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const rect = canvas.getBoundingClientRect();
      const width = Math.min(rect.width - 32, (rect.height - 30) * 2);
      const left = (rect.width - width) / 2;
      const context = canvas.getContext('2d')!;
      const brightness = (lon: number) => {
        const x = (left + (lon + 180) / 360 * width) * canvas.width / rect.width;
        const y = canvas.height / 2 + 8 * canvas.height / rect.height;
        const [r, g, b] = context.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return (r + g + b) / 3;
      };
      return { day: brightness(-20), night: brightness(150), seamWest: brightness(-178), seamEast: brightness(178) };
    });
    expect(pixels.day - pixels.night).toBeGreaterThan(20);
    expect(Math.abs(pixels.seamWest - pixels.seamEast)).toBeLessThan(20);
    await page.getByRole('button', { name: '公转视图' }).tap();
    const orbit = page.getByRole('region', { name: '地球公转' });
    await expect(orbit).toBeVisible();
    await orbit.getByRole('button', { name: '公转轨道上的秋分' }).tap();
    await expect(page.getByTestId('active-term')).toHaveText('秋分');
    await expect(page.getByTestId('orbit-hemisphere')).toHaveText('南北半球受光近对称');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({ path: info.outputPath('orbit-mobile.png'), fullPage: true });
    const chart = page.getByRole('region', { name: '全年昼长' });
    await page.getByRole('link', { name: '全年曲线' }).tap();
    await expect(chart.getByRole('img', { name: /全年每日昼长曲线/ })).toBeVisible();
    await chart.getByRole('button', { name: /^全年曲线 冬至/ }).tap();
    await expect(page.getByTestId('active-term')).toHaveText('冬至');
    await page.getByRole('button', { name: '添加对比地点' }).tap();
    await expect(chart.getByRole('img', { name: /两地全年昼长曲线/ })).toBeVisible();
    await expect(chart.getByTestId('annual-value-B')).toHaveText('0 小时');
    await page.getByRole('button', { name: '全年', exact: true }).tap();
    await expect(page.getByRole('slider', { name: '全年日期轴' })).toBeVisible();
    await page.getByLabel('全年播放速度').selectOption('12');
    await expect(chart.getByLabel('曲线播放速度')).toHaveValue('12');
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  });

  test('fits the presentation without native fullscreen in portrait and landscape', async ({ page }, info) => {
    await page.addInitScript(() => {
      HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('Fullscreen unavailable'));
    });
    await page.goto('/');
    await page.getByRole('button', { name: '2D 地图' }).tap();
    await page.getByRole('button', { name: '添加对比地点' }).tap();
    await page.getByLabel('对比地点预设').selectOption('悉尼');
    const entry = page.getByRole('button', { name: '全屏演示', exact: true });
    await entry.tap();
    const dialog = page.getByRole('dialog', { name: '全屏演示' });
    await expect(dialog.getByTestId('annual-value-B')).toBeVisible();
    await expect(dialog.getByText('B 悉尼', { exact: true })).toBeVisible();
    await expect.poll(() => presentationFits(dialog)).toBe(true);
    await page.screenshot({ path: info.outputPath('presentation-portrait.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => presentationFits(dialog)).toBe(true);
    await page.screenshot({ path: info.outputPath('presentation-landscape.png') });
    await dialog.getByRole('slider', { name: '演示日期轴' }).press('End');
    await expect(dialog.getByTestId('presentation-date')).toContainText('2026-12-31');
    await dialog.getByRole('button', { name: '退出全屏' }).tap();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel('当地日期', { exact: true })).toHaveValue('2026-12-31');
    await expect(page.getByLabel('对比地点预设')).toHaveValue('悉尼');
    await entry.tap();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(entry).toBeFocused();
  });
});
