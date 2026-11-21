import { useEffect, useRef } from 'react';
import { firstYear, lastYear, localAt } from './local-time';
import type { termsForLocalYear } from './local-time';
import type { SolarTerm } from './solar';

const major = new Set(['春分', '夏至', '秋分', '冬至']);
const labelTime = (term: SolarTerm, zone: string, precision: 'minute' | 'second' = 'minute') => {
  const local = localAt(term.time, zone);
  const clock = local.toPlainTime().toString({ smallestUnit: precision });
  return `${local.month} 月 ${local.day} 日 ${clock}`;
};

export function SeasonRail({ time, year, zone, data, onChange, onYear }: {
  time: number;
  year: number;
  zone: string;
  data: ReturnType<typeof termsForLocalYear>;
  onChange: (time: number) => void;
  onYear: (year: number) => void;
}) {
  const active = data.terms.findLast(term => term.time <= time) ?? data.preceding;
  const next = data.terms.find(term => term.time > time) ?? data.following;
  const scroll = useRef<HTMLDivElement>(null);
  const activeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outer = scroll.current;
    const button = activeButton.current;
    if (!outer || !button || outer.scrollWidth === outer.clientWidth) return;
    const target = outer.scrollLeft + button.getBoundingClientRect().left - outer.getBoundingClientRect().left - outer.clientWidth / 2;
    outer.scrollLeft = target;
  }, [active.time]);
  const position = (value: number) => `${100 * (value - data.start) / (data.end - data.start)}%`;

  return <section className="panel season-panel" aria-labelledby="season-title" data-guide="seasons">
    <div className="season-header">
      <div className="season-heading">
        <h2 id="season-title">二十四节气</h2>
        <div className="year-controls" aria-label="节气年份">
          <button className="ghost-button" aria-label="上一年" disabled={year <= firstYear} onClick={() => onYear(year - 1)}>‹</button>
          <span>{year}</span>
          <button className="ghost-button" aria-label="下一年" disabled={year >= lastYear} onClick={() => onYear(year + 1)}>›</button>
        </div>
      </div>
      <div className="season-summary">
        <span>当前 <strong data-testid="active-term">{active.name}</strong><time>{labelTime(active, zone)}</time></span>
        <span>下一节气 <strong>{next.name}</strong><time>{labelTime(next, zone)}</time></span>
      </div>
      <div className="season-shortcuts" aria-label="二分二至快捷入口">
        {data.terms.filter(term => major.has(term.name)).map(term => <button
          key={term.name} className="ghost-button" onClick={() => onChange(term.time)}>{term.name}</button>)}
      </div>
    </div>
    <div className="season-scroll" ref={scroll}>
      <div className="season-scale" aria-label="年度节气时间轴">
        <div className="season-track" />
        <span className="season-cursor" style={{ left: position(time) }} aria-hidden="true" />
        {data.terms.map((term, index) => <button type="button"
          key={term.name}
          ref={term.name === active.name ? activeButton : undefined}
          className={`term ${index % 2 ? 'term-bottom' : 'term-top'} ${major.has(term.name) ? 'major-term' : ''}`}
          style={{ left: position(term.time) }}
          aria-label={`${term.name} ${labelTime(term, zone)}，太阳黄经 ${term.longitude} 度`}
          aria-current={term.name === active.name ? 'date' : undefined}
          title={`${labelTime(term, zone, 'second')} · 视黄经 ${term.longitude}°`}
          onClick={() => onChange(term.time)}>
          <i aria-hidden="true" />
          <span>{term.name}</span>
        </button>)}
      </div>
    </div>
  </section>;
}
