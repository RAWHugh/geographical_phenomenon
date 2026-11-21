import { useEffect, useRef } from 'react';
import { prepareCanvas, useCanvasSize } from './canvas';
import { clockLabel, minuteMs } from './local-time';
import type { AnnualDay } from './local-time';
import type { HeightSample } from './solar';

type DailyChart = {
  mode: 'day';
  samples: HeightSample[];
  start: number;
  end: number;
  cursor: HeightSample;
};
type YearChart = {
  mode: 'year';
  days: AnnualDay[];
  index: number;
};
type ChartData = DailyChart | YearChart;

const left = 38;
const right = 14;
const top = 17;
const bottom = 31;
const lineColor = '#f4c382';

function drawChart(ctx: CanvasRenderingContext2D, width: number, height: number, data: ChartData, zone: string) {
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  if (plotWidth <= 0 || plotHeight <= 0) return;
  const xOf = (fraction: number) => left + fraction * plotWidth;
  const yOf = (value: number) => top + (90 - value) / 180 * plotHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(3, 9, 19, .28)';
  ctx.fillRect(left, yOf(0), plotWidth, plotHeight / 2);
  ctx.font = '11px "Cascadia Code", Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const degrees of [90, 45, 0, -45, -90]) {
    ctx.beginPath();
    ctx.moveTo(left, yOf(degrees));
    ctx.lineTo(width - right, yOf(degrees));
    ctx.strokeStyle = degrees === 0 ? '#607889' : '#283c4b';
    ctx.setLineDash(degrees === 0 ? [4, 3] : []);
    ctx.stroke();
    ctx.fillStyle = '#a7bac7';
    ctx.fillText(`${degrees}°`, left - 7, yOf(degrees));
  }
  ctx.setLineDash([]);
  ctx.textAlign = 'center';
  const ticks = data.mode === 'day' ? Array.from({ length: 5 }, (_, i) => ({
    fraction: i / 4,
    text: i === 4 ? '次日' : clockLabel(Math.round(data.start + (data.end - data.start) * i / 4), zone),
  })) : [0, 3, 6, 9, 11].map(month => {
    const expected = `-${String(month + 1).padStart(2, '0')}-01`;
    return {
      fraction: data.days.findIndex(day => day.date.endsWith(expected)) / (data.days.length - 1),
      text: `${month + 1}月`,
    };
  });
  for (const { text, fraction } of ticks) {
    const x = xOf(fraction);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, height - bottom);
    ctx.strokeStyle = 'rgba(117,149,166,.14)';
    ctx.stroke();
    ctx.fillStyle = '#a7bac7';
    ctx.fillText(text, Math.min(width - 15, x), height - bottom + 15);
  }
  const plotSamples = data.mode === 'day'
    ? data.samples.map(sample => ({ fraction: (sample.time - data.start) / (data.end - data.start), height: sample.height }))
    : data.days.map((day, index) => ({ fraction: index / (data.days.length - 1), height: day.sample?.height }));
  ctx.beginPath();
  let first = true;
  for (const { fraction, height: value } of plotSamples) {
    if (value === undefined) {
      first = true;
      continue;
    }
    if (first) ctx.moveTo(xOf(fraction), yOf(value));
    else ctx.lineTo(xOf(fraction), yOf(value));
    first = false;
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2;
  ctx.strokeStyle = lineColor;
  ctx.stroke();

  const fraction = data.mode === 'day'
    ? (data.cursor.time - data.start) / (data.end - data.start)
    : data.index / (data.days.length - 1);
  const value = data.mode === 'day' ? data.cursor.height : data.days[data.index]?.sample?.height;
  const x = xOf(fraction);
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, height - bottom);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#72c9c5';
  ctx.stroke();
  if (value !== undefined) {
    ctx.beginPath();
    ctx.arc(x, yOf(value), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#8ee6dc';
    ctx.fill();
    ctx.strokeStyle = '#121f2b';
    ctx.stroke();
  }
}

export function HeightChart({ data, zone, onChange }: {
  data: ChartData;
  zone: string;
  onChange: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (ctx) drawChart(ctx, size.width, size.height, data, zone);
  }, [size, data, zone]);
  const select = (fraction: number) => {
    const part = Math.min(1, Math.max(0, fraction));
    if (data.mode === 'day') {
      const time = data.start + Math.round((data.end - data.start) * part / minuteMs) * minuteMs;
      onChange(Math.min(time, data.end - minuteMs));
    } else {
      const day = data.days[Math.round(part * (data.days.length - 1))];
      if (day.sample) onChange(day.sample.time);
    }
  };
  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    select((event.clientX - rect.left - left) / (rect.width - left - right));
  };
  return <canvas
    ref={canvas}
    className="chart-canvas"
    role="img"
    aria-label={data.mode === 'day' ? '日内太阳高度角曲线，左右键移动 15 分钟，可拖动游标。' : '全年太阳上中天高度角曲线，点击或按左右键跳到当天上中天。'}
    tabIndex={0}
    onPointerDown={event => {
      if (data.mode === 'day') event.currentTarget.setPointerCapture(event.pointerId);
      pointer(event);
    }}
    onPointerMove={event => {
      if (data.mode === 'day' && event.currentTarget.hasPointerCapture(event.pointerId)) pointer(event);
    }}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (data.mode === 'day') {
        select((data.cursor.time - data.start + 15 * minuteMs * direction) / (data.end - data.start));
      } else {
        select((data.index + direction) / (data.days.length - 1));
      }
    }}
  />;
}
