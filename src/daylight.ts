import { solarAltitude } from './solar';
import type { HeightSample, Point } from './solar';

const precisionMs = 250;
const fullDayMs = 86_400_000;

type Period = { start: number; end: number; daylight: boolean };
type Crossing = { time: number; kind: 'rise' | 'set' };
type Regime = 'mixed' | 'polar-day' | 'polar-night' | 'all-day' | 'all-night';

export type DaylightSummary = {
  start: number;
  end: number;
  duration: number;
  periods: Period[];
  crossings: Crossing[];
  regime: Regime;
};

function refineExtremum(start: number, end: number, maximum: boolean, heightAt: (time: number) => number): HeightSample {
  while (end - start > precisionMs) {
    const first = Math.floor((2 * start + end) / 3);
    const second = Math.floor((start + 2 * end) / 3);
    if ((heightAt(first) < heightAt(second)) === maximum) start = first;
    else end = second;
  }
  const time = Math.round((start + end) / 2);
  return { time, height: heightAt(time) };
}

function crossingTime(left: HeightSample, right: HeightSample, heightAt: (time: number) => number): number {
  if (left.height === 0) return left.time;
  if (right.height === 0) return right.time;
  let start = left.time;
  let end = right.time;
  const positive = left.height > 0;
  while (end - start > precisionMs) {
    const mid = Math.floor((start + end) / 2);
    if ((heightAt(mid) >= 0) === positive) start = mid;
    else end = mid;
  }
  return Math.round((start + end) / 2);
}

function splitDay(samples: HeightSample[], heightAt: (time: number) => number) {
  const start = samples[0].time;
  const end = samples[samples.length - 1].time;
  const step = samples[1].time - start;
  const halo = [
    { time: start - step, height: heightAt(start - step) },
    ...samples,
    { time: end + step, height: heightAt(end + step) },
  ];
  const knots = [...samples];
  // A short daylight or night interval near a polar transition can fall between two samples.
  for (let i = 1; i < halo.length - 1; i++) {
    const previous = halo[i - 1];
    const current = halo[i];
    const next = halo[i + 1];
    const maximum = current.height >= previous.height && current.height > next.height;
    const minimum = current.height <= previous.height && current.height < next.height;
    if (!maximum && !minimum) continue;
    const extremum = refineExtremum(previous.time, next.time, maximum, heightAt);
    if (extremum.time > start && extremum.time < end) knots.push(extremum);
  }
  knots.sort((a, b) => a.time - b.time);

  const periods: Period[] = [];
  let boundary = start;
  let daylight = knots[0].height >= 0;
  for (let i = 1; i < knots.length; i++) {
    const nextIsDaylight = knots[i].height >= 0;
    if (nextIsDaylight === daylight) continue;
    const time = crossingTime(knots[i - 1], knots[i], heightAt);
    if (time > boundary) periods.push({ start: boundary, end: time, daylight });
    boundary = time;
    daylight = nextIsDaylight;
  }
  if (boundary < end) periods.push({ start: boundary, end, daylight });
  // A true tangent can yield two roots at the same instant. Merge the adjacent equal intervals.
  const merged: Period[] = [];
  for (const period of periods) {
    const previous = merged.at(-1);
    if (previous?.daylight === period.daylight) previous.end = period.end;
    else merged.push(period);
  }
  return merged;
}

export function daylightForSamples(samples: HeightSample[], heightAt: (time: number) => number): DaylightSummary | null {
  if (samples.length < 2) return null;
  const start = samples[0].time;
  const end = samples[samples.length - 1].time;
  const periods = splitDay(samples, heightAt);
  const duration = periods.reduce((sum, period) => sum + (period.daylight ? period.end - period.start : 0), 0);
  const crossings: Crossing[] = periods.slice(1).map(period => ({ time: period.start, kind: period.daylight ? 'rise' : 'set' }));

  let regime: Regime = 'mixed';
  if (periods.length === 1) {
    const { daylight } = periods[0];
    let continuous = true;
    // A shortened civil day by itself does not establish 24 hours of continuous light or darkness.
    if (end - start < fullDayMs) {
      const extra = Math.ceil((fullDayMs - (end - start)) / 2);
      const first = start - extra;
      const last = end + extra;
      const step = samples[1].time - start;
      const extended = [
        ...Array.from({ length: Math.ceil(extra / step) }, (_, i) => first + i * step),
        ...samples.map(sample => sample.time),
        ...Array.from({ length: Math.ceil(extra / step) }, (_, i) => Math.min(last, end + (i + 1) * step)),
      ].map(time => ({ time, height: heightAt(time) }));
      continuous = splitDay(extended, heightAt).length === 1;
    }
    regime = daylight ? (continuous ? 'polar-day' : 'all-day') : (continuous ? 'polar-night' : 'all-night');
  }
  return { start, end, duration, periods, crossings, regime };
}

export function daylightForLocation(samples: HeightSample[], point: Point) {
  return daylightForSamples(samples, time => solarAltitude(time, point));
}
