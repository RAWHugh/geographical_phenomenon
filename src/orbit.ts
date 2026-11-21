import { e_tilt, SunPosition } from 'astronomy-engine';
import { dot } from './solar';
import type { Vec3 } from './solar';

const radians = Math.PI / 180;
const tropicalYearMs = 365.2422 * 86_400_000;

export function orbitAt(time: number) {
  const sun = SunPosition(new Date(time));
  const distance = sun.vec.Length();
  const longitude = (sun.elon + 180) % 360;
  const angle = longitude * radians;
  const tilt = e_tilt(sun.vec.t).tobl;
  const north: Vec3 = [0, Math.sin(tilt * radians), Math.cos(tilt * radians)];
  // In this plane, Earth's heliocentric longitude is opposite the Sun's apparent longitude.
  const towardSun: Vec3 = [-Math.cos(angle), -Math.sin(angle), 0];
  const position: Vec3 = [-distance * towardSun[0], -distance * towardSun[1], 0];
  return { position, longitude, distance, north, tilt, towardSun, northSunAngle: Math.asin(dot(north, towardSun)) / radians };
}

export function orbitPath(year: number): Vec3[] {
  const start = Date.UTC(year, 0, 1);
  return Array.from({ length: 180 }, (_, index) => orbitAt(start + index * tropicalYearMs / 180).position);
}
