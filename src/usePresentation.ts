import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Session = { trigger: HTMLElement; x: number; y: number; native: boolean };

export function usePresentation() {
  const [presenting, setPresenting] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const session = useRef<Session>(null);

  const exit = useCallback(() => {
    if (stage.current && document.fullscreenElement === stage.current) {
      void document.exitFullscreen().finally(() => setPresenting(false)).catch(() => {});
    } else {
      setPresenting(false);
    }
  }, []);

  const open = (trigger: HTMLElement) => {
    const current = { trigger, x: window.scrollX, y: window.scrollY, native: false };
    session.current = current;
    setPresenting(true);
    const element = stage.current;
    if (!element?.requestFullscreen || document.fullscreenElement) return;
    try {
      void element.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        if (session.current === current) current.native = true;
        else if (document.fullscreenElement === element) void document.exitFullscreen().catch(() => {});
      }).catch(() => {});
    } catch {
      // The fixed viewport layout also works when native fullscreen is blocked.
    }
  };

  useLayoutEffect(() => {
    if (presenting) {
      closeButton.current?.focus({ preventScroll: true });
    } else if (session.current) {
      const { x, y, trigger } = session.current;
      session.current = null;
      trigger.focus({ preventScroll: true });
      window.scrollTo(x, y);
    }
  }, [presenting]);

  useEffect(() => {
    if (!presenting) return;
    const fullscreenChanged = () => {
      const current = session.current;
      if (!current) return;
      if (document.fullscreenElement === stage.current) current.native = true;
      else if (current.native) exit();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exit();
    };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.addEventListener('keydown', keyDown);
    fullscreenChanged();
    return () => {
      document.removeEventListener('fullscreenchange', fullscreenChanged);
      document.removeEventListener('keydown', keyDown);
    };
  }, [presenting, exit]);

  return { stage, closeButton, presenting, open, exit };
}
