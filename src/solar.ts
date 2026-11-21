import {
  Body, EquatorFromVector, Observer, RotateVector, Rotation_ECT_EQD,
  SearchHourAngle, SearchSunLongitude, SiderealTime, SunPosition,
} from 'astronomy-engine';

export type Vec3 = [number, number, number];
export type Point = { lat: number; lon: number };
export type SolarFrame = {
  direction: Vec3;
  dawnDirection: Vec3;
  subsolar: Point;
};
export type SolarTerm = { name: string; longitude: number; time: number };
export type HeightSample = { time: number; height: number };

const radians = Math.PI / 180;
const dayMs = 86_400_000;
export const wrapLongitude = (deg: number) => ((deg + 180) % 360 + 360) % 360 - 180;
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

export function surfaceVector({ lat, lon }: Point): Vec3 {
  const parallel = Math.cos(lat * radians);
  return [parallel * Math.cos(lon * radians), parallel * Math.sin(lon * radians), Math.sin(lat * radians)];
}

export function surfacePoint([x, y, z]: Vec3): Point {
  return { lat: Math.atan2(z, Math.hypot(x, y)) / radians, lon: wrapLongitude(Math.atan2(y, x) / radians) };
}

export function subsolarPoint(time: number): Point {
  const date = new Date(time);
  const sun = SunPosition(date);
  const equatorial = EquatorFromVector(RotateVector(Rotation_ECT_EQD(sun.vec.t), sun.vec));
  // The solar vector carries a light-time-adjusted epoch. Earth rotation uses the reception time.
  return { lat: equatorial.dec, lon: wrapLongitude(15 * (equatorial.ra - SiderealTime(date))) };
}

export function solarFrame(time: number): SolarFrame {
  const subsolar = subsolarPoint(time);
  const direction = surfaceVector(subsolar);
  const before = surfaceVector(subsolarPoint(time - 60_000));
  const after = surfaceVector(subsolarPoint(time + 60_000));
  const speed: Vec3 = [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
  const axis = normalize(cross(direction, speed));
  return { direction, dawnDirection: cross(axis, direction), subsolar };
}

export function terminatorArc(frame: SolarFrame, dawn: boolean): Point[] {
  const axis = cross(frame.direction, frame.dawnDirection);
  return Array.from({ length: 91 }, (_, index) => {
    const theta = Math.PI * index / 90;
    const along = Math.cos(theta);
    const across = (dawn ? 1 : -1) * Math.sin(theta);
    return surfacePoint([
      axis[0] * along + frame.dawnDirection[0] * across,
      axis[1] * along + frame.dawnDirection[1] * across,
      axis[2] * along + frame.dawnDirection[2] * across,
    ]);
  });
}

export function altitudeAt(location: Point, direction: Vec3): number {
  const cosine = dot(surfaceVector(location), direction);
  return Math.asin(Math.max(-1, Math.min(1, cosine))) / radians;
}

export function solarAltitude(time: number, location: Point): number {
  return altitudeAt(location, surfaceVector(subsolarPoint(time)));
}

export function geometricNoon(start: number, end: number, observer: Observer): HeightSample | null {
  const event = SearchHourAngle(Body.Sun, observer, 0, new Date(start - 2_000));
  const time = event.time.date.getTime();
  if (time < start || time >= end) return null;
  return { time, height: solarAltitude(time, { lat: observer.latitude, lon: observer.longitude }) };
}

const termNames = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑',
  '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至',
];
const termsByUtcYear = new Map<number, SolarTerm[]>();

export function solarTerms(year: number): SolarTerm[] {
  const cached = termsByUtcYear.get(year);
  if (cached) return cached;
  let start = Date.UTC(year, 0, 1) - dayMs;
  const terms = termNames.map((name, index) => {
    const longitude = (285 + 15 * index) % 360;
    const event = SearchSunLongitude(longitude, new Date(start), 24);
    if (!event || event.date.getUTCFullYear() !== year) {
      throw new Error(`无法计算 ${year} 年的${name}`);
    }
    const time = event.date.getTime();
    start = time + dayMs;
    return { name, time, longitude };
  });
  termsByUtcYear.set(year, terms);
  return terms;
}
