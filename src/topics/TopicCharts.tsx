import { geoContains } from 'd3-geo';
import { useEffect, useMemo, useRef } from 'react';
import { prepareCanvas, useCanvasSize } from '../canvas';
import { land } from '../earth-map';
import type { Point } from '../solar';
import { arrow, colorIndex, colorTable, scales } from './FieldMap';
import type { Cut } from './FieldMap';
import { clamp, coordinate, grids, levels, sample } from './topic-data';

export function CirculationSection({ meridional, vertical, activeLevel }: {
  meridional: Float32Array;
  vertical: Float32Array;
  activeLevel: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (!ctx) return;
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    const x0 = 48, x1 = width - 19, y0 = 14, y1 = height - 29;
    if (x1 <= x0 || y1 <= y0) return;
    const { height: count } = grids.atmosphere;
    const xx = (lat: number) => x0 + (lat + 90) / 180 * (x1 - x0);
    const yy = (level: number) => y0 + Math.log(level / 100) / Math.log(10) * (y1 - y0);
    const edges = [1000, ...levels.slice(1).map((level, index) => Math.sqrt(levels[index] * level)), 100];
    const colors = colorTable(scales.omega);
    ctx.fillStyle = '#0a1522';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    levels.forEach((_, row) => {
      const y = yy(edges[row + 1]);
      const bottom = yy(edges[row]);
      for (let col = 0; col < count; col++) {
        const val = vertical[row * count + count - col - 1];
        if (!Number.isFinite(val)) continue;
        const [r, g, b] = colors[colorIndex(val, scales.omega)];
        ctx.fillStyle = `rgb(${r} ${g} ${b})`;
        ctx.fillRect(x0 + col / count * (x1 - x0), y, (x1 - x0) / count + .4, bottom - y + .5);
      }
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.beginPath();
    const stride = width > 620 ? 4 : 7;
    levels.forEach((_, row) => {
      if (row === 0 || row === levels.length - 1) return;
      const centerY = (yy(edges[row]) + yy(edges[row + 1])) / 2;
      for (let col = Math.floor(stride / 2); col < count; col += stride) {
        const index = row * count + count - col - 1;
        const dx = clamp(meridional[index] * 3.2, -16, 16);
        const dy = clamp(vertical[index] * 220, -13, 13);
        if (!Number.isFinite(dx + dy) || Math.hypot(dx, dy) < 2.1) continue;
        arrow(ctx, x0 + (col + .5) / count * (x1 - x0) - dx / 2, centerY - dy / 2, dx, dy, 2.7);
      }
    });
    ctx.strokeStyle = 'rgba(235,249,247,.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const level of [...new Set([1000, 850, 500, 300, 200, 100, activeLevel])]) {
      const y = yy(level);
      ctx.fillStyle = level === activeLevel ? '#ffdc94' : '#b4c5d3';
      ctx.fillText(String(level), x0 - 7, y);
      if (level === activeLevel) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.strokeStyle = '#ffdc94';
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    ctx.fillStyle = '#b4c5d3';
    for (const lat of [-90, -60, -30, 0, 30, 60, 90]) {
      ctx.textAlign = lat === -90 ? 'left' : lat === 90 ? 'right' : 'center';
      ctx.fillText(coordinate(lat, 'lat'), xx(lat), height - 12);
    }
  }, [size, meridional, vertical, activeLevel]);
  return <div className="topic-section-plot">
    <canvas ref={canvas} className="visual-canvas" role="img" aria-label={`南极至北极的平均经向环流剖面，虚线标出 ${activeLevel} hPa`} />
  </div>;
}

const profileNames = ['气温', '降水', '陆地高程'];
const profileUnits = ['°C', 'mm/月', 'm'];
const profileColors = ['#ffbd83', '#8ee6dc', '#d2b6ff'];

export function ClimateProfile({ fields, cut, selection, onPick }: {
  fields: Float32Array[];
  cut: Cut;
  selection: Point;
  onPick: (point: Point) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const { axis, value } = cut;
  const direction = axis === 'lon' ? 'lat' : 'lon';
  const maximum = direction === 'lat' ? 90 : 180;
  const cursor = selection[direction];
  const coords = (position: number): Point =>
    axis === 'lon' ? { lon: value, lat: position } : { lat: value, lon: position };
  const coordinates = useMemo(() => Array.from({ length: maximum }, (_, i) => {
    const along = -maximum + 1 + i * 2;
    return axis === 'lon' ? { lon: value, lat: along } : { lat: value, lon: along };
  }), [axis, maximum, value]);
  const profile = useMemo(() => {
    const altitudeOnLand = coordinates.map(point => geoContains(land, [point.lon, point.lat]));
    return fields.map((field, index) => coordinates.map((point, i) => index === 2 && !altitudeOnLand[i]
      ? NaN : sample(field, grids.climate, point)));
  }, [fields, coordinates]);
  const cursorValues = fields.map((field, index) => index === 2 && !geoContains(land, [selection.lon, selection.lat])
    ? NaN : sample(field, grids.climate, selection));

  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (!ctx) return;
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    const left = 48, right = width - 20;
    if (right <= left) return;
    const lane = (height - 25) / 3;
    const xx = (point: number) => left + (point + maximum) / (2 * maximum) * (right - left);
    ctx.font = '11px system-ui, sans-serif';
    profile.forEach((values, index) => {
      const finite = values.filter(Number.isFinite);
      const step = [10, 100, 500][index];
      const low = Math.min(0, Math.floor(Math.min(0, ...finite) / step) * step);
      const high = Math.max(step, Math.ceil(Math.max(0, ...finite) / step) * step);
      const top = index * lane + 13, bottom = (index + 1) * lane - 5;
      const yy = (v: number) => bottom - (v - low) / (high - low) * (bottom - top);
      ctx.fillStyle = '#0b1826';
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#35485a';
      ctx.lineWidth = 1;
      ctx.fillStyle = '#abbecc';
      for (const tick of [low, high]) {
        ctx.fillText(tick.toString(), left - 6, yy(tick));
        ctx.beginPath();
        ctx.moveTo(left, yy(tick));
        ctx.lineTo(right, yy(tick));
        ctx.stroke();
      }
      ctx.beginPath();
      let open = false;
      values.forEach((val, column) => {
        if (!Number.isFinite(val)) {
          open = false;
          return;
        }
        const x = xx(coordinates[column][direction]);
        if (open) ctx.lineTo(x, yy(val));
        else ctx.moveTo(x, yy(val));
        open = true;
      });
      ctx.strokeStyle = profileColors[index];
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(xx(cursor), top);
      ctx.lineTo(xx(cursor), bottom);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#ffe19a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    });
    ctx.fillStyle = '#abbecc';
    for (const tick of [-maximum, -maximum / 2, 0, maximum / 2, maximum]) {
      ctx.textAlign = tick === -maximum ? 'left' : tick === maximum ? 'right' : 'center';
      ctx.fillText(coordinate(tick, direction), xx(tick), height - 11);
    }
  }, [size, coordinates, cursor, direction, maximum, profile]);

  return <>
    <ul className="topic-profile-legend" data-testid="profile-values">
      {profileNames.map((name, index) => <li key={name}>
        <i style={{ background: profileColors[index] }} />{name} <b>{Number.isFinite(cursorValues[index])
          ? `${cursorValues[index].toFixed(index === 0 ? 1 : 0)} ${profileUnits[index]}`
          : '—'}</b>
      </li>)}
    </ul>
    <div className="topic-profile-plot">
      <canvas ref={canvas} className="visual-canvas map-canvas" tabIndex={0}
        aria-label="气温、降水和陆地高程剖面。点击或按左右方向键移动游标。"
        onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const progress = clamp((event.clientX - bounds.left - 48) / (bounds.width - 68), 0, 1);
          onPick(coords(clamp(Math.round((progress * 2 - 1) * maximum), -maximum + 1, maximum - 1)));
        }}
        onKeyDown={event => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          onPick(coords(clamp(cursor + (event.key === 'ArrowLeft' ? -1 : 1), -maximum + 1, maximum - 1)));
        }}
      />
    </div>
  </>;
}
