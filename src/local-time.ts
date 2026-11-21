import { Temporal } from '@js-temporal/polyfill';
import lookupTimeZone from '@photostructure/tz-lookup';
import { Observer } from 'astronomy-engine';
import { geometricNoon, solarAltitude, solarTerms } from './solar';
import type { HeightSample, Point } from './solar';

export const firstYear = 2000;
export const lastYear = 2050;
export const minuteMs = 60_000;
export const initialTime = Date.UTC(2026, 5, 21, 4);

export type Place = Point & { name: string; zone: string };
export const places: Place[] = [
  { name: '北京', lat: 39.9042, lon: 116.4074, zone: 'Asia/Shanghai' },
  { name: '新加坡', lat: 1.3521, lon: 103.8198, zone: 'Asia/Singapore' },
  { name: '特罗姆瑟', lat: 69.65, lon: 18.96, zone: 'Europe/Oslo' },
  { name: '悉尼', lat: -33.8688, lon: 151.2093, zone: 'Australia/Sydney' },
  { name: '纽约', lat: 40.7128, lon: -74.006, zone: 'America/New_York' },
  { name: '开普敦', lat: -33.9249, lon: 18.4241, zone: 'Africa/Johannesburg' },
  { name: '南极点', lat: -90, lon: 0, zone: 'UTC' },
];

export function validZone(zone: string): boolean {
  if (!zone || !/^[a-z][a-z0-9_+./-]*$/i.test(zone)) return false;
  try {
    new Intl.DateTimeFormat('zh-CN', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function zoneAt({ lat, lon }: Point): string {
  const zone = lookupTimeZone(lat, lon);
  return validZone(zone) ? zone : 'UTC';
}

export const localAt = (time: number, zone: string) =>
  Temporal.Instant.fromEpochMilliseconds(time).toZonedDateTimeISO(zone);

export function dayBounds(day: string, zone: string) {
  const date = Temporal.PlainDate.from(day);
  const start = date.toZonedDateTime(zone);
  const end = date.add({ days: 1 }).toZonedDateTime(zone);
  return { start: start.epochMilliseconds, end: end.epochMilliseconds };
}

export function wallTimeOptions(wall: string, zone: string): { time: number; offset: string }[] {
  const date = Temporal.PlainDateTime.from(wall);
  return (['earlier', 'later'] as const)
    .map(disambiguation => date.toZonedDateTime(zone, { disambiguation }))
    .filter((result, index, all) =>
      result.toPlainDateTime().equals(date) && (index === 0 || !result.equals(all[0])))
    .map(result => ({ time: result.epochMilliseconds, offset: result.offset }));
}

export const clockLabel = (time: number, zone: string, includeSeconds = false) =>
  localAt(time, zone).toPlainTime().toString({ smallestUnit: includeSeconds ? 'second' : 'minute' });

export const coordinateLabel = ({ lat, lon }: Point) =>
  `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}  ${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;

export function dailyHeights(day: string, zone: string, point: Point): HeightSample[] {
  const { start, end } = dayBounds(day, zone);
  if (start === end) return [];
  const samples = [];
  for (let time = start; time < end; time += 5 * minuteMs) {
    samples.push({ time, height: solarAltitude(time, point) });
  }
  samples.push({ time: end, height: solarAltitude(end, point) });
  return samples;
}

export type AnnualDay = { date: string; sample: HeightSample | null };

export function annualHeights(year: number, zone: string, point: Point): AnnualDay[] {
  const first = Temporal.PlainDate.from({ year, month: 1, day: 1 });
  const observer = new Observer(point.lat, point.lon, 0);
  return Array.from({ length: first.daysInYear }, (_, index) => {
    const date = first.add({ days: index }).toString();
    const { start, end } = dayBounds(date, zone);
    return { date, sample: end > start ? geometricNoon(start, end, observer) : null };
  });
}

export function termsForLocalYear(year: number, zone: string) {
  const all = [year - 1, year, year + 1].flatMap(solarTerms);
  const start = dayBounds(`${year}-01-01`, zone).start;
  const end = dayBounds(`${year + 1}-01-01`, zone).start;
  const first = all.findIndex(term => term.time >= start);
  const next = all.findIndex(term => term.time >= end);
  return { start, end, terms: all.slice(first, next), preceding: all[first - 1], following: all[next] };
}
