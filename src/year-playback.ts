import { Temporal } from '@js-temporal/polyfill';

export const yearRates = [1, 4, 12, 24] as const;
export type YearRate = (typeof yearRates)[number];
export type PlaybackMode = 'day' | 'year';

export type YearCursor = {
  date: Temporal.PlainDate;
  clock: Temporal.PlainTime;
  zone: string;
  time: number;
};

function findDate(cursor: YearCursor, date: Temporal.PlainDate, direction: -1 | 1): YearCursor | null {
  while (date.year === cursor.date.year) {
    const wall = date.toPlainDateTime(cursor.clock);
    let target = wall.toZonedDateTime(cursor.zone, { disambiguation: 'compatible' });
    // A gap at the end of a date can move the wall clock past midnight.
    if (!target.toPlainDate().equals(date)) target = wall.toZonedDateTime(cursor.zone, { disambiguation: 'earlier' });
    if (target.toPlainDate().equals(date)) return { ...cursor, date, time: target.epochMilliseconds };
    date = date.add({ days: direction });
  }
  return null;
}

export function yearCursor(local: Temporal.ZonedDateTime): YearCursor {
  return { date: local.toPlainDate(), clock: local.toPlainTime(), zone: local.timeZoneId, time: local.epochMilliseconds };
}

export function shiftYearDate(cursor: YearCursor, direction: -1 | 1): YearCursor | null {
  return findDate(cursor, cursor.date.add({ days: direction }), direction);
}

export function jumpToYearDay(cursor: YearCursor, index: number): YearCursor | null {
  const date = cursor.date.with({ month: 1, day: 1 }).add({ days: index });
  const direction = index < cursor.date.dayOfYear - 1 ? -1 : 1;
  return findDate(cursor, date, direction) ?? findDate(cursor, date, direction === 1 ? -1 : 1);
}
