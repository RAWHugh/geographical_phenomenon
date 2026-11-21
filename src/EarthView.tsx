import { useEffect, useRef } from 'react';
import { prepareCanvas, useCanvasSize } from './canvas';
import { drawMap, makeNightLayer, pickMap } from './earth-map';
import type { PolarCaps } from './polar';
import type { Point, SolarFrame } from './solar';
import type { makeGlobe } from './globe';

type EarthProps = {
  frame: SolarFrame;
  location: Point;
  comparison: Point | null;
  polarCaps: PolarCaps | null;
  onPick: (point: Point) => void;
};

export function WorldMap({ frame, location, comparison, polarCaps, onPick, presenting }: EarthProps & { presenting: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = useCanvasSize(ref);
  const layer = useRef<ReturnType<typeof makeNightLayer>>(null);
  useEffect(() => {
    const ctx = prepareCanvas(ref.current!, size);
    if (!ctx) return;
    layer.current ??= makeNightLayer();
    drawMap(ctx, size.width, size.height, frame, location, layer.current(frame), polarCaps, comparison, presenting);
  }, [size, frame, location, comparison, polarCaps, presenting]);
  return <canvas
    className="visual-canvas map-canvas"
    aria-label={comparison ? '2D 世界地图。青色圆形为 A 点，粉色菱形为 B 点。' : '2D 世界地图。可点选观测点，也可用观测点面板输入经纬度。'}
    role="img"
    ref={ref}
    onClick={event => {
      const rect = event.currentTarget.getBoundingClientRect();
      const point = pickMap(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height, presenting);
      if (point) onPick(point);
    }}
  />;
}

export function Globe({ frame, location, comparison, polarCaps, onPick, onUnavailable, centerRequest }: EarthProps & {
  onUnavailable: () => void;
  centerRequest: Point | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const globe = useRef<ReturnType<typeof makeGlobe>>(null);
  const latest = useRef({ frame, location, comparison, polarCaps, onPick, centerRequest });
  latest.current = { frame, location, comparison, polarCaps, onPick, centerRequest };
  useEffect(() => {
    let cancelled = false;
    void import('./globe').then(({ makeGlobe }) => {
      if (cancelled || !canvas.current) return;
      const instance = makeGlobe(canvas.current, point => latest.current.onPick(point), onUnavailable);
      globe.current = instance;
      instance.draw(latest.current.frame, latest.current.location, latest.current.polarCaps, latest.current.comparison);
      if (latest.current.centerRequest) instance.center(latest.current.centerRequest);
    }).catch(() => {
      if (!cancelled) onUnavailable();
    });
    return () => {
      cancelled = true;
      globe.current?.dispose();
      globe.current = null;
    };
  }, [onUnavailable]);
  useEffect(() => globe.current?.draw(frame, location, polarCaps, comparison), [frame, location, polarCaps, comparison]);
  useEffect(() => {
    if (centerRequest) globe.current?.center(centerRequest);
  }, [centerRequest]);
  return <canvas
    className="visual-canvas globe-canvas"
    ref={canvas}
    tabIndex={0}
    role="img"
    aria-label={comparison ? '3D 地球。青色圆环为 A 点，粉色大圆环为 B 点。可拖动或用方向键旋转。' : '3D 地球。拖动或使用方向键旋转，滚轮或双指缩放，点选观测点。'}
  />;
}
