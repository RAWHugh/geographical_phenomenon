import { Temporal } from '@js-temporal/polyfill';
import { daylightForLocation } from './daylight';
import type { DaylightSummary } from './daylight';
import { dailyHeights } from './local-time';
import type { Point } from './solar';

type Regime = DaylightSummary['regime'];
export type PolarRegime = Extract<Regime, 'polar-day' | 'polar-night'>;
export type DaylightDay = {
  date: string;
  sample: { duration: number; span: number; midpoint: number; regime: Regime } | null;
};
export type PolarPeriod = {
  regime: PolarRegime;
  first: number;
  last: number;
  starts: string;
  ends: string;
};
export type AnnualDaylight = { days: DaylightDay[]; periods: PolarPeriod[] };
export type AnnualDaylightRequest = { year: number; zone: string; point: Point };
export type AnnualDaylightResponse = { data: AnnualDaylight } | { error: true };

function sampleDay(date: string, zone: string, point: Point): DaylightDay {
  const daylight = daylightForLocation(dailyHeights(date, zone, point), point);
  if (!daylight) return { date, sample: null };
  return { date, sample: {
    duration: daylight.duration,
    span: daylight.end - daylight.start,
    midpoint: Math.floor((daylight.start + daylight.end) / 2),
    regime: daylight.regime,
  } };
}

export function polarPeriods(days: DaylightDay[]): PolarPeriod[] {
  const periods: PolarPeriod[] = [];
  days.forEach((day, index) => {
    const regime = day.sample?.regime;
    if (regime !== 'polar-day' && regime !== 'polar-night') return;
    const previous = periods.at(-1);
    if (previous?.regime === regime && previous.last === index - 1) {
      previous.last = index;
      previous.ends = day.date;
    } else {
      periods.push({ regime, first: index, last: index, starts: day.date, ends: day.date });
    }
  });
  return periods;
}

export function annualDaylight({ year, zone, point }: AnnualDaylightRequest): AnnualDaylight {
  const start = Temporal.PlainDate.from({ year, month: 1, day: 1 });
  const days = Array.from({ length: start.daysInYear }, (_, index) =>
    sampleDay(start.add({ days: index }).toString(), zone, point));
  const periods = polarPeriods(days);

  // The shading is clipped at the chart edges. The dates describe the full interval.
  const extend = (date: string, direction: -1 | 1, regime: PolarRegime): string => {
    let cursor = Temporal.PlainDate.from(date);
    for (let days = 0; days < 366; days++) {
      const next = cursor.add({ days: direction });
      if (sampleDay(next.toString(), zone, point).sample?.regime !== regime) return cursor.toString();
      cursor = next;
    }
    throw new Error('极区日期区间超过一年');
  };
  const first = periods[0];
  const last = periods.at(-1);
  if (first?.first === 0) first.starts = extend(first.starts, -1, first.regime);
  if (last?.last === days.length - 1) last.ends = extend(last.ends, 1, last.regime);
  return { days, periods };
}
