import { geoEquirectangular, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import atlas from 'world-atlas/land-110m.json';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { LineString } from 'geojson';
import { observerColors } from './observers';
import type { ObserverSlot } from './observers';
import { polarPalette } from './polar';
import type { PolarCaps } from './polar';
import { dot, surfaceVector, terminatorArc } from './solar';
import type { Point, SolarFrame } from './solar';

const source = atlas as unknown as Topology<{ land: GeometryCollection }>;
export const land = feature(source, source.objects.land);
export const dawnColor = '#ffcb82';
export const duskColor = '#a9baf0';
export const sunColor = '#ffce81';

const worldWidth = 1440;
const worldHeight = worldWidth / 2;
let basemap: HTMLCanvasElement | undefined;

function worldProjection(width: number, x: number, y: number) {
  return geoEquirectangular().scale(width / (2 * Math.PI)).translate([x + width / 2, y + width / 4]);
}

function parallel(latitude: number): LineString {
  const coordinates = Array.from({ length: 91 }, (_, index) => [-180 + 4 * index, latitude]);
  return { type: 'LineString', coordinates };
}

export function earthTexture(): HTMLCanvasElement {
  if (basemap) return basemap;
  const canvas = document.createElement('canvas');
  canvas.width = worldWidth;
  canvas.height = worldHeight;
  const ctx = canvas.getContext('2d')!;
  const path = geoPath(worldProjection(worldWidth, 0, 0), ctx);
  ctx.fillStyle = '#215469';
  ctx.fillRect(0, 0, worldWidth, worldHeight);
  ctx.beginPath();
  path(land);
  ctx.fillStyle = '#6d9d9e';
  ctx.fill();
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = '#a1c2b8';
  ctx.stroke();
  ctx.beginPath();
  path(geoGraticule10());
  ctx.strokeStyle = 'rgba(199,222,226,.20)';
  ctx.stroke();
  ctx.beginPath();
  path(parallel(0));
  ctx.strokeStyle = 'rgba(234,247,245,.50)';
  ctx.stroke();
  ctx.beginPath();
  ctx.setLineDash([3, 4]);
  for (const latitude of [-66.56, -23.44, 23.44, 66.56]) path(parallel(latitude));
  ctx.strokeStyle = 'rgba(234,247,245,.40)';
  ctx.stroke();
  basemap = canvas;
  return canvas;
}

export function mapBounds(width: number, height: number, presenting = false) {
  const size = Math.min(width - (presenting ? 16 : 32), (height - (presenting ? 12 : 30)) * 2);
  return { x: (width - size) / 2, y: (height - size / 2) / 2, width: size, height: size / 2 };
}

export function pickMap(x: number, y: number, width: number, height: number, presenting = false): Point | null {
  const bounds = mapBounds(width, height, presenting);
  if (x < bounds.x || x > bounds.x + bounds.width || y < bounds.y || y > bounds.y + bounds.height) return null;
  return {
    lon: (x - bounds.x) / bounds.width * 360 - 180,
    lat: 90 - (y - bounds.y) / bounds.height * 180,
  };
}

export function makeNightLayer() {
  const width = 720;
  const height = 360;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(width, height);
  const longitude = Array.from({ length: width }, (_, x) => (x + .5) / width * 2 * Math.PI - Math.PI);
  const latitude = Array.from({ length: height }, (_, y) => Math.PI / 2 - (y + .5) / height * Math.PI);
  const cosLon = longitude.map(angle => Math.cos(angle));
  const sinLon = longitude.map(angle => Math.sin(angle));
  const cosLat = latitude.map(angle => Math.cos(angle));
  const sinLat = latitude.map(angle => Math.sin(angle));
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = 5;
    pixels.data[i + 1] = 14;
    pixels.data[i + 2] = 27;
  }
  return (frame: SolarFrame) => {
    const [sunX, sunY, sunZ] = frame.direction;
    const horizontal = cosLon.map((value, index) => value * sunX + sinLon[index] * sunY);
    let i = 3;
    for (let y = 0; y < height; y++) {
      const elevation = sunZ * sinLat[y];
      for (let x = 0; x < width; x++, i += 4) {
        pixels.data[i] = horizontal[x] * cosLat[y] + elevation < 0 ? 177 : 0;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  };
}

export function drawMap(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  frame: SolarFrame, location: Point, night: HTMLCanvasElement, polarCaps: PolarCaps | null,
  comparison: Point | null, presenting: boolean,
) {
  const bounds = mapBounds(width, height, presenting);
  if (bounds.width <= 0) return;
  const projection = worldProjection(bounds.width, bounds.x, bounds.y);
  const path = geoPath(projection, ctx);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.clip();
  ctx.drawImage(earthTexture(), bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.drawImage(night, bounds.x, bounds.y, bounds.width, bounds.height);
  if (polarCaps) {
    const capHeight = bounds.height * (90 - polarCaps.latitude) / 180;
    for (const hemisphere of [1, -1]) {
      const isDay = hemisphere === polarCaps.dayHemisphere;
      const top = hemisphere > 0 ? bounds.y : bounds.y + bounds.height - capHeight;
      const edge = hemisphere > 0 ? top + capHeight : top;
      ctx.fillStyle = isDay ? polarPalette.day : polarPalette.night;
      ctx.globalAlpha = .42;
      ctx.fillRect(bounds.x, top, bounds.width, capHeight);
      ctx.globalAlpha = .83;
      ctx.fillRect(bounds.x, edge - .55, bounds.width, 1.1);
    }
    ctx.globalAlpha = 1;
  }
  for (const dawn of [true, false]) {
    const coordinates = terminatorArc(frame, dawn).map(({ lon, lat }) => [lon, lat]);
    ctx.beginPath();
    path({ type: 'LineString', coordinates });
    ctx.strokeStyle = dawn ? dawnColor : duskColor;
    ctx.lineWidth = 1.6;
    ctx.setLineDash(dawn ? [] : [5, 4]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const markers: { point: Point; color: string; slot?: ObserverSlot }[] = [
    { point: frame.subsolar, color: sunColor },
    { point: location, color: observerColors.A, slot: comparison ? 'A' : undefined },
  ];
  if (comparison) markers.push({ point: comparison, color: observerColors.B, slot: 'B' });
  const overlap = comparison && dot(surfaceVector(location), surfaceVector(comparison)) > .9997;
  for (const { point, color, slot } of markers) {
    const [x, y] = projection([point.lon, point.lat])!;
    // Repeat wrapped markers so their full rings are visible at the map seam.
    for (const xOffset of [-bounds.width, 0, bounds.width]) {
      const center = x + xOffset;
      ctx.beginPath();
      if (slot === 'B') {
        ctx.moveTo(center, y - 11);
        ctx.lineTo(center + 11, y);
        ctx.lineTo(center, y + 11);
        ctx.lineTo(center - 11, y);
        ctx.closePath();
      } else {
        ctx.arc(center, y, 8, 0, 2 * Math.PI);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = color;
      if (slot !== 'B' || !overlap) {
        ctx.beginPath();
        ctx.arc(center, y, 3, 0, 2 * Math.PI);
        ctx.fill();
      }
      if (slot) {
        const labelX = center + (slot === 'A' ? 12 : -17);
        const labelY = Math.max(bounds.y + 10, Math.min(bounds.y + bounds.height - 3, y + 4));
        ctx.font = 'bold 11px Consolas, monospace';
        ctx.strokeStyle = '#091623';
        ctx.lineWidth = 2.6;
        ctx.strokeText(slot, labelX, labelY);
        ctx.fillText(slot, labelX, labelY);
      }
    }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(167,204,219,.40)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
}
