import { useEffect, useRef, useState } from 'react';
import type { AnnualDaylight, AnnualDaylightResponse } from './annual-daylight';
import type { Point } from './solar';

export function useAnnualDaylight(year: number, zone: string, point: Point | null) {
  const lat = point?.lat;
  const lon = point?.lon;
  const key = point ? JSON.stringify([year, zone, lat, lon]) : null;
  const cache = useRef(new Map<string, AnnualDaylight>());
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; data: AnnualDaylight | null }>();

  useEffect(() => {
    if (key === null || lat === undefined || lon === undefined || cache.current.has(key)) return;
    let worker: Worker | undefined;
    let obsolete = false;
    const fail = () => {
      worker?.terminate();
      if (!obsolete) setResult({ key, attempt, data: null });
    };
    try {
      worker = new Worker(new URL('./annual-daylight.worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (message: MessageEvent<AnnualDaylightResponse>) => {
        if (obsolete) return;
        if ('error' in message.data) {
          fail();
          return;
        }
        if (cache.current.size >= 8) {
          const oldest = cache.current.keys().next().value;
          if (oldest !== undefined) cache.current.delete(oldest);
        }
        cache.current.set(key, message.data.data);
        worker?.terminate();
        setResult({ key, attempt, data: message.data.data });
      };
      worker.onerror = fail;
      worker.onmessageerror = fail;
      worker.postMessage({ year, zone, point: { lat, lon } });
    } catch {
      fail();
    }
    return () => {
      obsolete = true;
      worker?.terminate();
    };
  }, [key, attempt, year, zone, lat, lon]);

  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return { data: key === null ? undefined : cache.current.get(key) ?? current?.data, retry: () => setAttempt(n => n + 1) };
}
