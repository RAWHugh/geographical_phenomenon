import { useState } from 'react';
import { clockLabel, firstYear, lastYear, localAt, minuteMs, wallTimeOptions } from './local-time';
import { YearRatePicker } from './YearRatePicker';
import type { usePlayback } from './usePlayback';

export function TimeBar({ time, zone, start, end, playback, onChange, onPresent }: {
  time: number;
  zone: string;
  start: number;
  end: number;
  playback: ReturnType<typeof usePlayback>;
  onChange: (time: number) => void;
  onPresent: (trigger: HTMLElement) => void;
}) {
  const local = localAt(time, zone);
  const date = local.toPlainDate().toString();
  const clock = clockLabel(time, zone, true);
  const { mode, playing, pause, toggle, changeMode, yearRate, setYearRate, yearStep, yearJump } = playback;
  const isYear = mode === 'year';
  const dayIndex = local.dayOfYear - 1;
  const lastDayIndex = local.daysInYear - 1;
  const wall = `${date}T${clock}`;
  const [edit, setEdit] = useState<{ base: string; date: string; clock: string }>();
  const [error, setError] = useState('');
  const [choices, setChoices] = useState<ReturnType<typeof wallTimeOptions>>([]);
  const base = `${wall}/${zone}`;
  const draft = edit?.base === base ? edit : undefined;
  const change = (field: 'date' | 'clock', value: string) => {
    pause();
    setEdit({ base, date: draft?.date ?? date, clock: draft?.clock ?? clock, [field]: value });
    setError('');
    setChoices([]);
  };
  const commit = (value: number) => {
    setEdit(undefined);
    setChoices([]);
    onChange(value);
  };
  const seek = (value: number | undefined) => {
    if (value !== undefined) onChange(value);
  };
  const progress = isYear ? dayIndex / lastDayIndex : (time - start) / (end - start);
  const playLabel = isYear ? (playing ? '暂停全年播放' : '播放全年变化') : (playing ? '暂停播放' : '播放日内变化');

  return <section className="time-bar panel" aria-label="观测时间" data-guide="time">
    <div className="time-controls">
      <button className="play-button" type="button" aria-label={playLabel} onClick={() => toggle()}>
        <span aria-hidden="true" className={playing ? 'pause-icon' : 'play-icon'} />
      </button>
      <div className="playback-info">
        <strong>{isYear ? '全年播放' : '日内播放'}</strong>
        <small>{isYear ? '保留当地时刻' : '1 秒 = 1 小时'}</small>
      </div>
      <div className="segments playback-mode" aria-label="播放模式">
        <button type="button" aria-pressed={!isYear} onClick={() => changeMode('day')}>日内</button>
        <button type="button" aria-pressed={isYear} onClick={() => changeMode('year')}>全年</button>
      </div>
      <div className="hour-steps" aria-label={isYear ? '按日期调整' : '按小时调整'}>
        {isYear ? <>
          <button type="button" className="ghost-button" aria-label="上一天" disabled={dayIndex === 0} onClick={() => seek(yearStep(-1))}>−1天</button>
          <button type="button" className="ghost-button" aria-label="下一天" disabled={dayIndex === lastDayIndex} onClick={() => seek(yearStep(1))}>+1天</button>
        </> : <>
          <button type="button" className="ghost-button" aria-label="后退一小时" onClick={() => onChange(time - 60 * minuteMs)}>−1h</button>
          <button type="button" className="ghost-button" aria-label="前进一小时" onClick={() => onChange(time + 60 * minuteMs)}>+1h</button>
        </>}
      </div>
      {isYear && <YearRatePicker value={yearRate} onChange={setYearRate} label="全年播放速度" />}
      <form className="local-time-form" onSubmit={event => {
        event.preventDefault();
        if (!draft) return;
        try {
          const options = wallTimeOptions(`${draft.date}T${draft.clock}`, zone);
          if (options.length === 1) commit(options[0].time);
          else if (options.length === 0) setError('该当地时间因时钟调整被跳过，请选择其他时间。');
          else setChoices(options);
        } catch {
          setError('请输入有效的当地日期和时间。');
        }
      }}>
        <input type="date" aria-label="当地日期" value={draft?.date ?? date} min={`${firstYear}-01-01`} max={`${lastYear}-12-31`}
          onFocus={pause} onChange={event => change('date', event.target.value)} required />
        <input type="time" aria-label="当地时刻" step={1} value={draft?.clock ?? clock}
          onFocus={pause} onChange={event => change('clock', event.target.value)} required />
        {draft && <div className="edit-actions">
          <button className="small-button" type="submit">应用</button>
          <button className="ghost-button" type="button" onClick={() => setEdit(undefined)}>取消</button>
        </div>}
        {draft && error && <p className="form-message" role="alert">{error}</p>}
        {draft && choices.length > 0 && <div className="form-message choices" role="group" aria-label="选择重复时刻的 UTC 偏移">
          <span>这个当地时刻出现两次</span>
          {choices.map(choice => <button className="small-button" key={choice.time} type="button" onClick={() => commit(choice.time)}>UTC{choice.offset}</button>)}
        </div>}
      </form>
      <span className="timezone" data-testid="current-zone" title={zone}>当地时间 <b>UTC{local.offset}</b></span>
      <button className="ghost-button now-button" type="button" onClick={() => onChange(Date.now())}>现在</button>
      <button className="ghost-button presentation-entry" type="button" onClick={event => onPresent(event.currentTarget)}>全屏演示</button>
    </div>
    <div className="range-row">
      <span>{isYear ? '1月1日' : clockLabel(start, zone)}</span>
      <input type="range" aria-label={isYear ? '全年日期轴' : '日内时间轴'}
        aria-valuetext={isYear ? date : `${clock} UTC${local.offset}`}
        min={0} max={isYear ? lastDayIndex : Math.round((end - start) / minuteMs) - 1} step={1}
        value={isYear ? dayIndex : Math.floor((time - start) / minuteMs)}
        style={{ '--progress': `${progress * 100}%` } as React.CSSProperties}
        onChange={event => {
          const value = Number(event.target.value);
          if (isYear) seek(yearJump(value));
          else onChange(start + value * minuteMs);
        }} />
      <span>{isYear ? '12月31日' : `次日 ${clockLabel(end, zone)}`}</span>
    </div>
  </section>;
}
