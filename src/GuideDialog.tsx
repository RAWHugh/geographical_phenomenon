import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { useGuide } from './useGuide';

type Placement = {
  card: { left: number; top: number };
  spotlight?: { left: number; top: number; width: number; height: number };
};

const gap = 12;
const clamp = (value: number, lower: number, upper: number) => Math.max(lower, Math.min(value, upper));

function positionGuide(target: HTMLElement, card: HTMLElement, move: boolean): Placement {
  const { clientWidth: width, clientHeight: height } = document.documentElement;
  const { width: cardWidth, height: cardHeight } = card.getBoundingClientRect();
  let rect = target.getBoundingClientRect();
  const right = width - rect.right >= cardWidth + 3 * gap;
  const left = !right && rect.left >= cardWidth + 3 * gap;
  const available = right || left ? height : height - cardHeight - 2 * gap;

  if (move) {
    const top = Math.max(gap, (available - rect.height) / 2);
    window.scrollTo(window.scrollX, Math.max(0, window.scrollY + rect.top - top));
    rect = target.getBoundingClientRect();
  }

  const cardLeft = right ? rect.right + 2 * gap : left ? rect.left - cardWidth - 2 * gap : (width - cardWidth) / 2;
  const cardTop = right || left
    ? clamp(rect.top + (rect.height - cardHeight) / 2, gap, height - cardHeight - gap)
    : Math.max(gap, height - cardHeight - gap);
  const x = clamp(rect.left - 5, 3, width - 3);
  const y = clamp(rect.top - 5, 3, height - 3);
  const x2 = clamp(rect.right + 5, 3, width - 3);
  const y2 = clamp(rect.bottom + 5, 3, right || left ? height - 3 : cardTop - 6);
  return {
    card: { left: cardLeft, top: cardTop },
    spotlight: x2 > x && y2 > y ? { left: x, top: y, width: x2 - x, height: y2 - y } : undefined,
  };
}

export function GuideDialog({ guide }: { guide: ReturnType<typeof useGuide> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [placement, setPlacement] = useState<Placement>();
  const { content, index, active, dismiss } = guide;
  const id = useId();
  const count = content.steps.length;
  const isOpen = index !== null;
  const last = index === count - 1;
  const restore = useRef(guide.restorePage);
  restore.current = guide.restorePage;

  useLayoutEffect(() => {
    const node = dialog.current!;
    if (isOpen && !node.open) node.showModal();
    else if (!isOpen && node.open) {
      node.close();
      restore.current();
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    title.current?.focus({ preventScroll: true });
    if (!active) return;
    const target = document.querySelector<HTMLElement>(`[data-guide="${active.id}"]`);
    const panel = card.current;
    if (!target || !panel) {
      setPlacement(undefined);
      return;
    }
    const move = () => setPlacement(positionGuide(target, panel, true));
    const measure = () => setPlacement(positionGuide(target, panel, false));
    move();
    const resize = new ResizeObserver(measure);
    resize.observe(target);
    resize.observe(panel);
    window.addEventListener('resize', move);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      resize.disconnect();
      window.removeEventListener('resize', move);
      window.removeEventListener('scroll', measure);
    };
  }, [active, isOpen]);

  const position = active ? placement : undefined;
  return <dialog className="guide-dialog" ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    data-stepping={Boolean(active)} onCancel={event => {
      event.preventDefault();
      dismiss();
    }}>
    {position?.spotlight
      ? <div className="guide-spotlight" style={position.spotlight} aria-hidden="true" />
      : <div className="guide-scrim" aria-hidden="true" />}
    <section className={`guide-card${active ? '' : ' guide-welcome'}${position ? ' guide-anchored' : ''}`}
      ref={card} style={position?.card}>
      <div className="guide-top">
        <span>{active ? '使用引导' : content.label}</span>
        <button type="button" className="ghost-button guide-close" aria-label="关闭引导" onClick={dismiss}>×</button>
      </div>
      {active && index !== null && <div className="guide-progress">
        <progress value={index + 1} max={count} aria-label={`第 ${index + 1} 步，共 ${count} 步`} />
        <span aria-hidden="true">{index + 1} / {count}</span>
      </div>}
      <div className="guide-content" key={active?.id ?? 'welcome'}>
        <h2 id={`${id}-title`} ref={title} tabIndex={-1}>{active?.title ?? content.title}</h2>
        <p id={`${id}-description`}>{active?.description ?? content.description}</p>
        {active ? <ul className="guide-tips">
          {active.tips.map(([label, body]) => <li key={label}><strong>{label}</strong><span>{body}</span></li>)}
        </ul> : <ol className="guide-overview">
          {content.overview.map(line => <li key={line}>{line}</li>)}
        </ol>}
        {active?.link && <a className="guide-step-link" href={active.link.href} onClick={dismiss}>{active.link.label}</a>}
      </div>
      <div className="guide-actions">
        {active ? <>
          <button type="button" className="guide-skip" onClick={dismiss}>跳过引导</button>
          <button type="button" className="ghost-button" onClick={guide.back}>上一步</button>
          <button type="button" className="small-button" onClick={last ? dismiss : guide.next}>{last ? '完成引导' : '下一步'}</button>
        </> : <>
          <button type="button" className="guide-skip" onClick={dismiss}>直接探索</button>
          <button type="button" className="small-button" onClick={guide.next}>开始逐步引导</button>
        </>}
      </div>
    </section>
  </dialog>;
}
