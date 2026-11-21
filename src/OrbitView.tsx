import { useEffect, useMemo, useRef } from 'react';
import { prepareCanvas, useCanvasSize } from './canvas';
import { orbitAt, orbitPath } from './orbit';
import { cross, dot } from './solar';
import type { SolarTerm, Vec3 } from './solar';

type XY = [number, number];
const angle = 52 * Math.PI / 180;
const right: Vec3 = [Math.cos(angle), Math.sin(angle), 0];
const inclination = .61;
const up: Vec3 = [-right[1] * inclination, right[0] * inclination, Math.sqrt(1 - inclination ** 2)];
const towardViewer = cross(right, up);
const normal: Vec3 = [0, 0, 1];
const cyan = '#8ee6dc';

function createProjection(width: number, height: number, dense: boolean) {
  const center: XY = [width / 2, height * .51];
  const scale = Math.max(1, Math.min((width - (dense ? 68 : 88)) / 2, (height - (dense ? 42 : 104)) / (2 * inclination)));
  const project = (point: Vec3): XY => [center[0] + scale * dot(point, right), center[1] - scale * dot(point, up)];
  return { center, project, dense, radius: dense ? Math.min(15, Math.max(6, scale * .16)) : Math.min(24, Math.max(13, scale * .15)) };
}

function line(ctx: CanvasRenderingContext2D, start: XY, end: XY, color: string, width = 1) {
  ctx.beginPath();
  ctx.moveTo(...start);
  ctx.lineTo(...end);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, at: XY, toward: XY, color: string, size = 5) {
  const heading = Math.atan2(toward[1] - at[1], toward[0] - at[0]);
  ctx.save();
  ctx.translate(...at);
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(-size, -size * .64);
  ctx.lineTo(size * .33, 0);
  ctx.lineTo(-size, size * .64);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function earthDisc(ctx: CanvasRenderingContext2D, earth: XY, radius: number, towardSun: Vec3) {
  const visibleLight = dot(towardSun, towardViewer);
  const lightX = dot(towardSun, right);
  const lightY = -dot(towardSun, up);
  ctx.save();
  ctx.translate(...earth);
  ctx.rotate(Math.atan2(lightY, lightX));
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, 2 * Math.PI);
  ctx.fillStyle = '#18364c';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#80bbca';
  ctx.stroke();

  // The visible limb is a circle, and the projected terminator curves with the phase angle.
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2);
  for (let step = 1; step <= 32; step++) {
    const theta = Math.PI * step / 32;
    ctx.lineTo(-visibleLight * radius * Math.sin(theta), radius * Math.cos(theta));
  }
  ctx.closePath();
  const light = ctx.createLinearGradient(-radius, 0, radius, 0);
  light.addColorStop(0, '#37798c');
  light.addColorStop(1, '#87bbbf');
  ctx.fillStyle = light;
  ctx.fill();
  ctx.restore();
}

function paintOrbit(
  ctx: CanvasRenderingContext2D, width: number, height: number, path: Vec3[], state: ReturnType<typeof orbitAt>,
  { center, project, radius, dense }: ReturnType<typeof createProjection>,
) {
  ctx.clearRect(0, 0, width, height);
  const projectedPath = path.map(project);
  ctx.beginPath();
  projectedPath.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(106, 151, 183, .07)';
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#678495';
  ctx.stroke();
  for (const index of [22, 67, 112, 157]) arrow(ctx, projectedPath[index], projectedPath[index + 1], '#a0b9c6', 6);

  const earth = project(state.position);
  const sunRadius = radius * .88;
  const sunlight = ctx.createRadialGradient(...center, sunRadius * .55, ...center, sunRadius * 2.2);
  sunlight.addColorStop(0, 'rgba(255, 187, 102, .32)');
  sunlight.addColorStop(1, 'rgba(255, 187, 102, 0)');
  ctx.fillStyle = sunlight;
  ctx.fillRect(center[0] - sunRadius * 2.2, center[1] - sunRadius * 2.2, sunRadius * 4.4, sunRadius * 4.4);
  ctx.setLineDash([5, 4]);
  line(ctx, center, earth, '#c6a575');
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(...center, sunRadius, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffcb82';
  ctx.fill();
  ctx.font = dense ? '11px system-ui, sans-serif' : '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f9d7a4';
  ctx.fillText('太阳', center[0], center[1] + sunRadius + (dense ? 12 : 18));

  earthDisc(ctx, earth, radius, state.towardSun);
  const axisLength = radius + (dense ? 14 : 26);
  const extend = (axis: Vec3, sign: number): XY => {
    const x = dot(axis, right);
    const y = -dot(axis, up);
    const scale = axisLength * sign / Math.hypot(x, y);
    return [earth[0] + x * scale, earth[1] + y * scale];
  };
  const reference = extend(normal, 1);
  ctx.setLineDash([3, 3]);
  line(ctx, earth, reference, '#bfced8', 1.15);
  ctx.setLineDash([]);
  const north = extend(state.north, 1);
  const south = extend(state.north, -.78);
  line(ctx, south, north, cyan, 1.65);
  arrow(ctx, north, extend(state.north, 2), cyan);
  ctx.fillStyle = cyan;
  ctx.font = '600 12px Consolas, monospace';
  ctx.fillText('N', north[0] + 6, north[1] - 6);
}

export function OrbitView({ time, year, terms, onChange, presenting }: {
  time: number;
  year: number;
  terms: SolarTerm[];
  onChange: (time: number) => void;
  presenting: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(canvas);
  const path = useMemo(() => orbitPath(year), [year]);
  const bookmarks = useMemo(() => terms
    .filter(term => term.longitude % 90 === 0)
    .map(term => ({ ...term, position: orbitAt(term.time).position })), [terms]);
  const state = useMemo(() => orbitAt(time), [time]);
  const dense = presenting && (size.height < 190 || size.width < 330);
  const projection = useMemo(() => createProjection(size.width, size.height, dense), [size, dense]);
  const earth = projection.project(state.position);
  const displayLongitude = (Math.round(state.longitude * 10) % 3600 / 10).toFixed(1);
  const hemispheres = Math.abs(state.northSunAngle) < .5
    ? '南北半球受光近对称'
    : state.northSunAngle > 0 ? '北极向阳倾斜' : '南极向阳倾斜';

  useEffect(() => {
    const context = prepareCanvas(canvas.current!, size);
    if (context) paintOrbit(context, size.width, size.height, path, state, projection);
  }, [size, state, path, projection]);

  return <section className={`panel orbit-panel${dense ? ' dense-orbit' : ''}`} id="orbital-view" aria-labelledby="orbit-title" data-guide="orbit">
    <header className="orbit-header">
      <h2 id="orbit-title">地球公转</h2>
      <span>{dense ? <>地轴倾角 <b data-testid="orbit-tilt">{state.tilt.toFixed(2)}°</b></> : `${year} 年 · 斜视轨道面`}</span>
    </header>
    <div className="orbit-picture">
      <canvas ref={canvas} className="visual-canvas" role="img"
        aria-label={`太阳与地球公转轨道。地球日心黄经 ${displayLongitude} 度，${hemispheres}。`} />
      {size.width > 0 && bookmarks.map(term => {
        const [x, y] = projection.project(term.position);
        const nearEarth = Math.hypot(x - earth[0], y - earth[1]) < projection.radius + 7;
        return <button type="button" key={term.name}
          className={`orbit-term ${x < projection.center[0] ? 'orbit-term-left' : 'orbit-term-right'} ${nearEarth ? 'near-earth' : ''}`}
          aria-label={`公转轨道上的${term.name}`} aria-current={time === term.time ? 'date' : undefined}
          style={{ left: x, top: y }} onClick={() => onChange(term.time)}>
          <span>{term.name}</span>
        </button>;
      })}
      {!dense && <div className="orbit-stats">
        <span>地轴倾角 <b data-testid="orbit-tilt">{state.tilt.toFixed(2)}°</b></span>
        <span>日地距离 <b>{state.distance.toFixed(3)} AU</b></span>
      </div>}
      <p className="orbit-season" data-testid="orbit-hemisphere">{hemispheres}</p>
    </div>
    <div className="orbit-footer">
      <div className="legend" aria-label="公转图例">
        <span><i className="orbit-axis-swatch" />地轴</span>
        <span><i className="orbit-normal-swatch" />轨道面法线</span>
      </div>
      <small>天体大小已放大</small>
    </div>
  </section>;
}
