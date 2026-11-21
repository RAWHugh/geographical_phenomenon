import { geoGraticule, geoOrthographic, geoPath } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { prepareCanvas, useCanvasSize } from '../canvas';
import { wrapLongitude } from '../solar';
import { arrow } from './FieldMap';
import { clamp, coordinate } from './topic-data';
import type { Coordinates, PlateFrame } from './topic-data';

function regionCenter(frame: PlateFrame): Coordinates {
  return [(frame.india[0] + frame.eurasia[0]) / 2, (frame.india[1] + frame.eurasia[1]) / 2];
}

export function PlateGlobe({ frames, index }: { frames: PlateFrame[]; index: number }) {
  const frame = frames[index];
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const [center, setCenter] = useState<Coordinates>(() => regionCenter(frame));
  const drag = useRef<{ x: number; y: number; center: Coordinates } | null>(null);
  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (!ctx) return;
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    const radius = Math.min(width, height) * .46;
    const globe = geoOrthographic().scale(radius).translate([width / 2, height / 2]).rotate([-center[0], -center[1]]);
    const project = geoPath(globe, ctx);
    ctx.beginPath();
    project({ type: 'Sphere' });
    const fill = ctx.createRadialGradient(width / 2 - radius * .34, height / 2 - radius * .36, 0, width / 2, height / 2, radius);
    fill.addColorStop(0, '#1e4156');
    fill.addColorStop(1, '#102638');
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = '#456477';
    ctx.stroke();
    ctx.beginPath();
    project(geoGraticule().step([30, 30])());
    ctx.strokeStyle = 'rgba(172,211,222,.17)';
    ctx.lineWidth = .8;
    ctx.stroke();

    ctx.beginPath();
    project({ type: 'MultiLineString', coordinates: frame.coasts });
    ctx.strokeStyle = '#a0dccc';
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.beginPath();
    project({ type: 'MultiLineString', coordinates: frame.boundaries });
    ctx.strokeStyle = 'rgba(232,163,139,.76)';
    ctx.lineWidth = .9;
    ctx.stroke();
    if (index > 0) {
      ctx.beginPath();
      project({ type: 'LineString', coordinates: frames.slice(0, index + 1).map(item => item.india) });
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#ffe09b';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.font = `600 ${width < 450 ? 11 : 12}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const points = [
      { position: frame.india, color: '#ffd686', name: '印度', shift: -10 },
      { position: frame.eurasia, color: '#c1b9fa', name: '欧亚', shift: 10 },
    ];
    const pointPath = geoPath(globe);
    for (const { position, color, name, shift } of points) {
      // The streaming projection clips points on the far side of the globe.
      ctx.beginPath();
      project.pointRadius(5)({ type: 'Point', coordinates: position });
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#122335';
      ctx.lineWidth = 1.3;
      ctx.stroke();
      if (!pointPath({ type: 'Point', coordinates: position })) continue;
      const [x, y] = globe(position)!;
      ctx.strokeStyle = '#122335';
      ctx.lineWidth = 3;
      ctx.textAlign = shift < 0 ? 'right' : 'left';
      ctx.strokeText(name, x + shift, y);
      ctx.fillText(name, x + shift, y);
    }
  }, [size, center, frames, frame, index]);
  const formatPoint = ([lon, lat]: Coordinates) => `${coordinate(lat, 'lat')} · ${coordinate(lon, 'lon')}`;
  return <>
    <div className="topic-globe">
      <canvas ref={canvas} className="visual-canvas globe-canvas" tabIndex={0}
        aria-label={`距今 ${frame.age} Ma 的板块重建地球。拖动或使用方向键旋转。`}
        onPointerDown={event => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, y: event.clientY, center };
        }}
        onPointerMove={event => {
          const origin = drag.current;
          if (!origin) return;
          setCenter([
            wrapLongitude(origin.center[0] - (event.clientX - origin.x) * .4),
            clamp(origin.center[1] + (event.clientY - origin.y) * .4, -89, 89),
          ]);
        }}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          const offset = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, 10], ArrowDown: [0, -10] }[event.key];
          if (!offset) return;
          event.preventDefault();
          setCenter(([lon, lat]) => [wrapLongitude(lon + offset[0]), clamp(lat + offset[1], -89, 89)]);
        }}
      />
      <button type="button" className="ghost-button topic-recenter" onClick={() => setCenter(regionCenter(frame))}>定位印度－欧亚</button>
    </div>
    <div className="topic-plate-legend">
      <span><i />大陆轮廓</span><span><i />板块边界</span><span><i />印度点已走过的轨迹</span>
    </div>
    <dl className="topic-readouts" data-testid="plate-positions">
      <div><dt>印度参考点</dt><dd>{formatPoint(frame.india)}</dd></div>
      <div><dt>欧亚参考点</dt><dd>{formatPoint(frame.eurasia)}</dd></div>
    </dl>
  </>;
}

const stages = [
  { heading: '洋盆逐渐闭合', copy: '印度板块北移，新特提斯洋逐渐变窄，洋壳向欧亚大陆边缘一侧俯冲。' },
  { heading: '大陆开始碰撞', copy: '印度大陆边缘抵达欧亚大陆边缘附近。不同碰撞定义与地质证据给出的年代有差异。' },
  { heading: '地壳缩短与增厚', copy: '持续汇聚使地壳变形、增厚，喜马拉雅山系与青藏高原逐步抬升。' },
] as const;

export function OrogenySection({ age }: { age: number }) {
  const index = age > 60 ? 0 : age >= 40 ? 1 : 2;
  const stage = stages[index];
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (!ctx) return;
    const { width, height } = size;
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.scale(width / 460, height / 212);
    const polygon = (color: string, points: Coordinates[]) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    ctx.fillStyle = '#302d3c';
    ctx.fillRect(19, 112, 422, 83);
    const edge = [244, 214, 178][index];
    if (index < 2) {
      polygon('#24546d', [[116, 84], [edge, 84], [edge, 114], [116, 114]]);
      polygon('#50798e', [[92, 113], [edge, 113], [edge + 91, 183], [edge + 77, 189], [edge - 12, 124], [92, 124]]);
    }
    const relief: Coordinates[] = index === 2
      ? [[edge, 104], [224, 93], [243, 66], [254, 81], [271, 49], [285, 70], [297, 61], [325, 74], [362, 74], [401, 102]]
      : [[edge, 108], [edge + 22, 93], [edge + 45, 86], [edge + 61, 95], [401, 102]];
    polygon('#b48e70', [...relief, [441, 102], [441, 132], [337, 136], [261, index === 2 ? 167 : 139], [edge, 124]]);
    const margin = [116, 205, 237][index];
    polygon('#e1a879', [[19, 98], [68, 93], [margin - 21, 98], [margin, 110],
      [margin + (index === 2 ? 57 : 0), index === 2 ? 156 : 132], [94, 133], [19, 127]]);
    ctx.beginPath();
    arrow(ctx, 42, 71, 52, 0, 7);
    arrow(ctx, 418, 62, -40, 0, 7);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffe29b';
    ctx.stroke();
    ctx.fillStyle = '#e6edf1';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('印度板块', 32, 51);
    ctx.textAlign = 'right';
    ctx.fillText('欧亚板块', 426, 44);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#aec8d8';
    if (index === 0) ctx.fillText('新特提斯洋', (116 + edge) / 2, 77);
    if (index === 2) ctx.fillText('增厚的大陆地壳', 272, 186);
    ctx.restore();
  }, [size, index]);
  return <>
    <div className="topic-orogeny-plot">
      <canvas ref={canvas} className="visual-canvas" role="img" aria-label={`教学剖面，无比例尺。 ${stage.copy}`} />
    </div>
    <h3 data-testid="orogeny-stage">{stage.heading}</h3>
    <p>{stage.copy}</p>
  </>;
}
