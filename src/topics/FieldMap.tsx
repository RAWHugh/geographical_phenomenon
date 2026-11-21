import { geoEquirectangular, geoPath } from 'd3-geo';
import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { prepareCanvas, useCanvasSize } from '../canvas';
import { land } from '../earth-map';
import { wrapLongitude } from '../solar';
import type { Point } from '../solar';
import { clamp, gridPoint, grids, sample } from './topic-data';
import type { Grid } from './topic-data';

export interface Scale {
  min: number;
  max: number;
  colors: readonly [string, string, string, string, string];
  labels: string[];
}

export const scales = {
  oceanSpeed: { min: 0, max: 1, colors: ['#142c49', '#164d74', '#168f9a', '#69cdb4', '#fee196'], labels: ['0', '0.25', '0.50', '0.75', '≥1 m/s'] },
  temperature: { min: -30, max: 35, colors: ['#32355d', '#336db0', '#63b7b7', '#e6bc69', '#bd5149'], labels: ['≤−30', '−14', '2.5', '19', '≥35 °C'] },
  seaTemperature: { min: -2, max: 32, colors: ['#39385f', '#285f9e', '#51acae', '#e5bc68', '#c6534f'], labels: ['≤−2', '6.5', '15', '23.5', '≥32 °C'] },
  wind: { min: 0, max: 60, colors: ['#172c45', '#236486', '#3fa8a1', '#c1bf72', '#f9bd77'], labels: ['0', '15', '30', '45', '≥60 m/s'] },
  rain: { min: 0, max: 400, colors: ['#252f44', '#29517a', '#26878a', '#66bba0', '#d4e98b'], labels: ['0', '100', '200', '300', '≥400 mm'] },
  omega: { min: -.10, max: .10, colors: ['#34b59b', '#1c6d69', '#192c42', '#95723f', '#e8af71'], labels: ['≤−0.10', '−0.05', '0', '+0.05', '≥+0.10 Pa/s'] },
} satisfies Record<string, Scale>;

export function colorTable(scale: Scale) {
  const stops = scale.colors.map(color => [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)));
  return Array.from({ length: 256 }, (_, index) => {
    const progress = index * 4 / 255;
    const segment = Math.min(Math.floor(progress), 3);
    return stops[segment].map((channel, rgb) => Math.round(channel + (stops[segment + 1][rgb] - channel) * (progress - segment)));
  });
}

export const colorIndex = (value: number, scale: Scale) => Math.round(clamp((value - scale.min) / (scale.max - scale.min), 0, 1) * 255);

export function ColorLegend({ scale, label }: { scale: Scale; label: string }) {
  return <div className="topic-color-legend" aria-label={label}>
    <span>{label}</span>
    <div className="topic-color-ramp" style={{ background: `linear-gradient(90deg, ${scale.colors.join(',')})` }} />
    <div className="topic-color-labels">{scale.labels.map(tick => <span key={tick}>{tick}</span>)}</div>
  </div>;
}

export interface Vectors { u: Float32Array; v: Float32Array }
export type Cut = { axis: 'lon' | 'lat'; value: number };

export const magnitude = ({ u, v }: Vectors) => u.map((value, index) => Math.hypot(value, v[index]));

function raster(grid: Grid, field: Float32Array, scale: Scale) {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(grid.width, grid.height);
  const colors = colorTable(scale);
  field.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const rgba = index * 4;
    image.data.set(colors[colorIndex(value, scale)], rgba);
    image.data[rgba + 3] = 255;
  });
  context.putImageData(image, 0, 0);
  return canvas;
}

export function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, head = 3) {
  const angle = Math.atan2(dy, dx);
  const endX = x + dx, endY = y + dy;
  ctx.moveTo(x, y);
  ctx.lineTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(angle - .53), endY - head * Math.sin(angle - .53));
  ctx.moveTo(endX, endY);
  ctx.lineTo(endX - head * Math.cos(angle + .53), endY - head * Math.sin(angle + .53));
}

function vectorAt(grid: Grid, vectors: Vectors, point: Point) {
  const u = sample(vectors.u, grid, point);
  const v = sample(vectors.v, grid, point);
  if (!Number.isFinite(u) || !Number.isFinite(v) || Math.hypot(u, v) < .009) return null;
  return [u / Math.max(.18, Math.cos(point.lat * Math.PI / 180)), v] as const;
}

function flowPaths(grid: Grid, vectors: Vectors) {
  const paths: Point[][] = [];
  for (let y = 2; y < grid.height; y += 4) {
    for (let x = 2; x < grid.width; x += 5) {
      let point = gridPoint(grid, x, y);
      const path = [point];
      for (let step = 0; step < 15; step++) {
        const speed = vectorAt(grid, vectors, point);
        if (!speed) break;
        const [u, v] = speed;
        const dt = .47 / Math.max(.2, Math.hypot(u, v));
        const next = { lon: point.lon + u * dt, lat: point.lat + v * dt };
        if (Math.abs(next.lon) >= 180 || Math.abs(next.lat) >= 90 || !vectorAt(grid, vectors, next)) break;
        path.push(next);
        point = next;
      }
      if (path.length >= 4) paths.push(path);
    }
  }
  return paths;
}

export function FieldMap({ label, field, grid, scale, vectors, animate = false, cut, selection, onPick }: {
  label: string;
  field: Float32Array;
  grid: Grid;
  scale: Scale;
  vectors?: Vectors;
  animate?: boolean;
  cut?: Cut;
  selection: Point;
  onPick: (point: Point) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const motion = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const shaded = useMemo(() => raster(grid, field, scale), [field, grid, scale]);
  const paths = useMemo(() => animate && vectors ? flowPaths(grid, vectors) : [], [animate, grid, vectors]);
  const { width, height } = size;
  const { lon, lat } = selection;
  const cutAxis = cut?.axis;
  const cutValue = cut?.value;

  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (!ctx) return;
    const xx = (x: number) => (x + 180) / 360 * width;
    const yy = (y: number) => (90 - y) / 180 * height;
    const projection = geoEquirectangular().scale(width / (2 * Math.PI)).translate([width / 2, height / 2]);
    const path = geoPath(projection, ctx);
    ctx.fillStyle = '#101e31';
    ctx.fillRect(0, 0, width, height);
    ctx.beginPath();
    path(land);
    ctx.fillStyle = '#203746';
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(shaded, 0, 0, width, height);
    ctx.beginPath();
    for (let value = -150; value <= 150; value += 30) {
      ctx.moveTo(xx(value), 0);
      ctx.lineTo(xx(value), height);
    }
    for (let value = -60; value <= 60; value += 30) {
      ctx.moveTo(0, yy(value));
      ctx.lineTo(width, yy(value));
    }
    ctx.strokeStyle = 'rgba(218,238,250,.17)';
    ctx.lineWidth = .7;
    ctx.stroke();
    ctx.beginPath();
    path(land);
    ctx.strokeStyle = 'rgba(212,241,238,.42)';
    ctx.stroke();
    if (vectors) {
      const stride = width < 570 ? 20 : 13;
      ctx.beginPath();
      for (let y = 7; y < 180; y += stride) {
        for (let x = 7; x < 360; x += stride) {
          const point = { lon: x - 180, lat: 90 - y };
          const vector = vectorAt(grid, vectors, point);
          if (!vector) continue;
          const [u, v] = vector;
          const speed = Math.hypot(u, v);
          const len = clamp(speed / (grid === grids.ocean ? .05 : 2.3), 4, width < 570 ? 11 : 16);
          const dx = u / speed * len;
          const dy = -v / speed * len;
          arrow(ctx, xx(point.lon) - dx / 2, yy(point.lat) - dy / 2, dx, dy, Math.min(3.3, len * .43));
        }
      }
      ctx.strokeStyle = 'rgba(235,251,245,.72)';
      ctx.lineWidth = .9;
      ctx.stroke();
    }
    if (cutAxis && cutValue !== undefined) {
      ctx.beginPath();
      if (cutAxis === 'lon') {
        ctx.moveTo(xx(cutValue), 0); ctx.lineTo(xx(cutValue), height);
      } else {
        ctx.moveTo(0, yy(cutValue)); ctx.lineTo(width, yy(cutValue));
      }
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ffda86';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const x = xx(lon), y = yy(lat);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = '#0b1a29';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = '#ffe194';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [size, shaded, width, height, grid, vectors, lon, lat, cutAxis, cutValue]);

  useEffect(() => {
    const ctx = prepareCanvas(motion.current!, size);
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!paths.length) return;
    let raf = 0;
    let previous = 0;
    const animatePaths = (time: number) => {
      raf = requestAnimationFrame(animatePaths);
      if (time - previous < 32) return;
      previous = time;
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      paths.forEach((path, index) => {
        const t = (time * .007 + index * .63) % (path.length - 1);
        const segment = Math.floor(t);
        const a = path[segment], b = path[segment + 1];
        const x = (a.lon + 180 + (b.lon - a.lon) * (t - segment)) / 360 * width;
        const y = (90 - a.lat - (b.lat - a.lat) * (t - segment)) / 180 * height;
        ctx.moveTo(x + 1, y);
        ctx.arc(x, y, 1, 0, 2 * Math.PI);
      });
      ctx.fillStyle = 'rgba(226,255,239,.72)';
      ctx.fill();
    };
    raf = requestAnimationFrame(animatePaths);
    return () => cancelAnimationFrame(raf);
  }, [size, paths, width, height]);

  const pick = (event: MouseEvent<HTMLCanvasElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onPick({
      lon: clamp(Math.round((event.clientX - box.left) / box.width * 360 - 180), -180, 179),
      lat: clamp(Math.round(90 - (event.clientY - box.top) / box.height * 180), -89, 89),
    });
  };
  const move = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const offset = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[event.key];
    if (!offset) return;
    event.preventDefault();
    const step = event.shiftKey ? 10 : 1;
    onPick({ lon: wrapLongitude(lon + offset[0] * step), lat: clamp(lat + offset[1] * step, -89, 89) });
  };
  return <div className="topic-map">
    <canvas ref={canvas} className="visual-canvas map-canvas" tabIndex={0} aria-label={`${label}。点击或用方向键选择位置。`}
      onClick={pick} onKeyDown={move} />
    <canvas ref={motion} className="visual-canvas topic-motion" aria-hidden="true" />
  </div>;
}
