import { wrapLongitude } from '../solar';
import type { Point } from '../solar';

export const topicIds = ['ocean', 'atmosphere', 'mountains', 'climate', 'compare'] as const;
export type TopicPage = typeof topicIds[number];
export type Topic = Exclude<TopicPage, 'compare'>;
export type Coordinates = [number, number];

export const topicNames = {
  solar: '日照地理',
  ocean: '洋流',
  atmosphere: '大气环流',
  mountains: '造山运动',
  climate: '气候剖面',
  compare: '季节对比',
};

export const topicIconUrl = (topic: TopicPage) => `./icons/${topic}.svg`;

export const grids = {
  ocean: { width: 360, height: 180 },
  atmosphere: { width: 144, height: 72 },
  climate: { width: 180, height: 90 },
};
export type Grid = typeof grids.ocean;
export const levels = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100] as const;
export const windLevels = [850, 200] as const;
export const ages = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0] as const;
export const months = Array.from({ length: 12 }, (_, month) => `${month + 1} 月`);
export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface PlateFrame {
  age: number;
  coasts: Coordinates[][];
  boundaries: Coordinates[][];
  india: Coordinates;
  eurasia: Coordinates;
}

export const animationsOff = '(prefers-reduced-motion: reduce)';

export function gridPoint(grid: Grid, x: number, y: number): Point {
  return { lon: (x + .5) / grid.width * 360 - 180, lat: 90 - (y + .5) / grid.height * 180 };
}

export function sample(field: Float32Array, grid: Grid, { lon, lat }: Point): number {
  const x = Math.floor((wrapLongitude(lon) + 180) / 360 * grid.width);
  const y = clamp(Math.floor((90 - lat) / 180 * grid.height), 0, grid.height - 1);
  return field[y * grid.width + x];
}

export function bearing(u: number, v: number) {
  return (Math.round(Math.atan2(u, v) * 180 / Math.PI) + 360) % 360;
}

export function coordinate(value: number, axis: 'lon' | 'lat') {
  if (value === 0) return '0°';
  return `${Math.abs(value).toFixed(1).replace(/\.0$/, '')}° ${axis === 'lon' ? (value < 0 ? 'W' : 'E') : (value < 0 ? 'S' : 'N')}`;
}

export function layers(data: Float32Array, size: number, start: number, count: number) {
  return Array.from({ length: count }, (_, index) => data.subarray((start + index) * size, (start + index + 1) * size));
}

export function oceanMonth(data: Float32Array, month: number) {
  const [u, v, temperature] = layers(data, grids.ocean.width * grids.ocean.height, month * 3, 3);
  return { u, v, temperature };
}

export function windMonth(data: Float32Array, month: number, level: typeof windLevels[number]) {
  const start = month * 4 + windLevels.indexOf(level) * 2;
  const [u, v] = layers(data, grids.atmosphere.width * grids.atmosphere.height, start, 2);
  return { u, v };
}

export function climateMonth(data: Float32Array, month: number) {
  return layers(data, grids.climate.width * grids.climate.height, month * 2, 2);
}

const dataLength = {
  ocean: 12 * 3 * grids.ocean.width * grids.ocean.height,
  atmosphere: 12 * grids.atmosphere.height * (4 * grids.atmosphere.width + 2 * levels.length),
  climate: 25 * grids.climate.width * grids.climate.height,
};

const cache = new Map<Topic, Promise<Float32Array | PlateFrame[]>>();

export function loadTopic(topic: Exclude<Topic, 'mountains'>): Promise<Float32Array>;
export function loadTopic(topic: Topic): Promise<Float32Array | PlateFrame[]>;
export function loadTopic(topic: Topic) {
  const found = cache.get(topic);
  if (found) return found;
  const result = (async () => {
    const suffix = topic === 'mountains' ? 'json' : 'f32';
    const response = await fetch(`./data/${topic}.${suffix}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (topic === 'mountains') {
      const frames = await response.json() as PlateFrame[];
      if (!Array.isArray(frames) || frames.length !== ages.length || !frames.every((frame, index) =>
        frame.age === ages[index] && frame.coasts?.length && frame.boundaries?.length
        && frame.india?.length === 2 && frame.eurasia?.length === 2)) throw new Error('Invalid reconstruction');
      return frames;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== dataLength[topic] * 4) throw new Error('Invalid grid size');
    // The files use IEEE float32 little-endian.
    if (new Uint8Array(new Uint16Array([1]).buffer)[0] === 1) return new Float32Array(buffer);
    const view = new DataView(buffer);
    return Float32Array.from({ length: dataLength[topic] }, (_, index) => view.getFloat32(index * 4, true));
  })().catch((error: unknown) => {
    cache.delete(topic);
    throw error;
  });
  cache.set(topic, result);
  return result;
}
