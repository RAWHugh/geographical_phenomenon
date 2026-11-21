import { useRef, useState } from 'react';
import { solarGuide } from './guide';
import type { GuideContent } from './guide';

export function useGuide(content: GuideContent = solarGuide) {
  const { steps, storageKey } = content;
  const [index, setIndex] = useState<number | null>(() => {
    if (!storageKey) return null;
    try {
      if (localStorage.getItem(storageKey) === 'seen') return null;
    } catch {
      // The guide can still be used when the browser blocks storage.
    }
    return -1;
  });
  const position = useRef({ x: window.scrollX, y: window.scrollY });
  const launchButton = useRef<HTMLButtonElement>(null);
  const open = () => {
    position.current = { x: window.scrollX, y: window.scrollY };
    setIndex(-1);
  };
  const dismiss = () => {
    try {
      if (storageKey) localStorage.setItem(storageKey, 'seen');
    } catch {
      // Closing remains available without storage.
    }
    setIndex(null);
  };
  const active = index === null ? undefined : steps[index];

  return {
    content, index, active, launchButton, open, dismiss,
    next: () => setIndex(current => current === null ? current : Math.min(current + 1, steps.length - 1)),
    back: () => setIndex(current => current === null ? current : Math.max(current - 1, -1)),
    restorePage: () => {
      launchButton.current?.focus({ preventScroll: true });
      window.scrollTo(position.current.x, position.current.y);
    },
  };
}
