import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { animationsOff, topicIds, topicNames } from './topic-data';
import type { TopicPage } from './topic-data';

export function TopicNav({ active }: { active: TopicPage | 'solar' }) {
  return <nav className="shell topic-nav" aria-label="地理专题" data-guide="topics">
    {(['solar', ...topicIds] as const).map(topic => <a key={topic}
      href={topic === 'solar' ? '#' : `#${topic}`} aria-current={active === topic ? 'page' : undefined}>
      {topicNames[topic]}
    </a>)}
  </nav>;
}

export function TopicHeader({ topic, period, compact = false, actions }: {
  topic: TopicPage;
  period: string;
  compact?: boolean;
  actions?: ReactNode;
}) {
  return <header className={compact ? 'masthead topic-compact-header' : 'masthead'}>
    <div className="shell masthead-inner">
      <div className="wordmark">
        <span className="orbit-logo" aria-hidden="true"><i /></span>
        <div><h1>{topicNames[topic]}</h1><p>{period}</p></div>
      </div>
      {actions && <div className="masthead-actions">{actions}</div>}
    </div>
    <TopicNav active={topic} />
  </header>;
}

export function Timeline({ labels, index, onSelect, label, loop = true, playLabel, paused = false, guideTargets }: {
  labels: readonly string[];
  index: number;
  onSelect: (value: number) => void;
  label: string;
  loop?: boolean;
  playLabel?: string;
  paused?: boolean;
  guideTargets?: { playback: string; choices: string };
}) {
  const [running, setPlaying] = useState(false);
  const [delay, setDelay] = useState(950);
  const playing = running && !paused;
  const last = labels.length - 1;
  useEffect(() => {
    if (paused) setPlaying(false);
  }, [paused]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const next = (index + 1) % labels.length;
      onSelect(next);
      if (!loop && next === last) setPlaying(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [delay, index, labels.length, last, loop, onSelect, playing]);
  return <section className="panel topic-timeline" aria-label={label}>
    <div className="topic-timeline-tools" data-guide={guideTargets?.playback}>
      <button type="button" className={playLabel ? 'play-button topic-labeled-play' : 'play-button'}
        aria-label={playing ? '暂停专题播放' : playLabel ?? '播放专题时间轴'}
        onClick={() => {
          if (!playing && !loop && index === last) onSelect(0);
          setPlaying(!playing);
        }}>
        <span className={playing ? 'pause-icon' : 'play-icon'} aria-hidden="true" />
        {playLabel && <span>{playing ? '暂停' : playLabel}</span>}
      </button>
      <div><small>{label}</small><strong data-testid="topic-time">{labels[index]}</strong></div>
      <select className="year-rate-picker" aria-label="专题播放速度" value={delay} onChange={event => setDelay(Number(event.target.value))}>
        <option value={1600}>慢速</option><option value={950}>常速</option><option value={420}>快速</option>
      </select>
    </div>
    <div className="topic-ticks" data-guide={guideTargets?.choices}>
      {labels.map((text, step) => <button type="button" key={text} aria-pressed={index === step}
        onClick={() => { setPlaying(false); onSelect(step); }}>{text}</button>)}
    </div>
  </section>;
}

export function useMotionPreference() {
  const [reduced, setReduced] = useState(() => matchMedia(animationsOff).matches);
  useEffect(() => {
    const media = matchMedia(animationsOff);
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function Segments<T extends string | number>({ options, value, onSelect, label }: {
  options: readonly (readonly [T, string])[];
  value: T;
  onSelect: (value: T) => void;
  label: string;
}) {
  return <div className="segments" role="group" aria-label={label}>
    {options.map(([key, text]) => <button type="button" key={key} aria-pressed={key === value}
      onClick={() => onSelect(key)}>{text}</button>)}
  </div>;
}

export function Readouts({ children }: { children: ReactNode }) {
  return <dl className="topic-readouts">{children}</dl>;
}

export function Readout({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
