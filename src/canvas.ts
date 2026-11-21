import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

const emptySize = { width: 0, height: 0, ratio: 1 };

export function useCanvasSize(ref: RefObject<HTMLCanvasElement | null>) {
  const [size, setSize] = useState(emptySize);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const measure = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio, 2);
      setSize(old => old.width === width && old.height === height && old.ratio === ratio ? old : { width, height, ratio });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return size;
}

export function prepareCanvas(canvas: HTMLCanvasElement, { width, height, ratio }: typeof emptySize) {
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);
  if (!w || !h) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}
