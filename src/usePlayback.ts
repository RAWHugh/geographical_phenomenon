import { useCallback, useEffect, useRef, useState } from 'react';
import { jumpToYearDay, shiftYearDate, yearCursor } from './year-playback';
import type { PlaybackMode, YearCursor, YearRate } from './year-playback';

export function usePlayback(
  local: Parameters<typeof yearCursor>[0],
  bounds: { start: number; end: number },
  setTime: (time: number) => void,
) {
  const [mode, setMode] = useState<PlaybackMode>('day');
  const [playing, setPlaying] = useState(false);
  const [yearRate, setYearRate] = useState<YearRate>(4);
  const dayOrigin = useRef(local.epochMilliseconds);
  const yearRun = useRef<YearCursor>(null);
  const end = bounds.end - 1_000;

  const pause = useCallback(() => setPlaying(false), []);
  const reset = () => {
    yearRun.current = null;
    pause();
  };
  const changeMode = (nextMode: PlaybackMode) => {
    if (mode === nextMode) return;
    pause();
    setMode(nextMode);
  };
  const toggle = (nextMode: PlaybackMode = mode) => {
    if (playing && nextMode === mode) {
      pause();
      return;
    }
    const time = local.epochMilliseconds;
    if (nextMode === 'year') {
      const previous = yearRun.current;
      let cursor = previous?.time === time && previous.zone === local.timeZoneId ? previous : yearCursor(local);
      if (cursor.date.dayOfYear === cursor.date.daysInYear) {
        cursor = jumpToYearDay(cursor, 0) ?? cursor;
        setTime(cursor.time);
      }
      yearRun.current = cursor;
    } else {
      dayOrigin.current = time >= end ? bounds.start : time;
      setTime(dayOrigin.current);
    }
    setMode(nextMode);
    setPlaying(true);
  };

  useEffect(() => {
    if (!playing || mode !== 'day') return;
    const baseline = performance.now();
    const origin = dayOrigin.current;
    let raf = 0;
    let lastRender = 0;
    const advance = (now: number) => {
      if (now - lastRender >= 45) {
        lastRender = now;
        const next = Math.round(origin + (now - baseline) * 3_600);
        setTime(Math.min(end, next));
        if (next >= end) {
          setPlaying(false);
          return;
        }
      }
      raf = requestAnimationFrame(advance);
    };
    raf = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(raf);
  }, [playing, mode, end, setTime]);

  useEffect(() => {
    if (!playing || mode !== 'year') return;
    const timer = window.setInterval(() => {
      const current = yearRun.current;
      const next = current && shiftYearDate(current, 1);
      if (next) {
        yearRun.current = next;
        setTime(next.time);
      }
      if (!next || next.date.dayOfYear === next.date.daysInYear) {
        clearInterval(timer);
        setPlaying(false);
      }
    }, 1_000 / yearRate);
    return () => clearInterval(timer);
  }, [mode, playing, yearRate, setTime]);

  return {
    mode, playing, yearRate, setYearRate, pause, reset, changeMode, toggle,
    yearStep: (direction: -1 | 1) => shiftYearDate(yearCursor(local), direction)?.time,
    yearJump: (index: number) => jumpToYearDay(yearCursor(local), index)?.time,
  };
}
