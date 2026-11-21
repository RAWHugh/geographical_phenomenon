import { YearRatePicker } from './YearRatePicker';
import type { RefObject } from 'react';
import type { localAt } from './local-time';
import type { usePlayback } from './usePlayback';

export function PresentationControls({ local, term, playback, onChange, closeButton, onExit }: {
  local: ReturnType<typeof localAt>;
  term: string;
  playback: ReturnType<typeof usePlayback>;
  onChange: (time: number) => void;
  closeButton: RefObject<HTMLButtonElement | null>;
  onExit: () => void;
}) {
  const playing = playback.mode === 'year' && playback.playing;
  const date = local.toPlainDate().toString();
  const clock = local.toPlainTime().toString({ smallestUnit: 'minute' });
  const index = local.dayOfYear - 1;
  const end = local.daysInYear - 1;
  return <header className="presentation-toolbar panel" aria-label="全屏演示控制">
    <div className="presentation-time">
      <h1>全年演示</h1>
      <time dateTime={`${date}T${clock}${local.offset}`} data-testid="presentation-date">{date} {clock}</time>
      <span className="presentation-term">{term}</span>
    </div>
    <div className="presentation-transport">
      <button className="small-button presentation-play" type="button"
        aria-label={playing ? '暂停演示' : '播放演示'} onClick={() => playback.toggle('year')}>
        <span className={playing ? 'pause-icon' : 'play-icon'} aria-hidden="true" />
        {playing ? '暂停' : '播放'}
      </button>
      <YearRatePicker value={playback.yearRate} onChange={playback.setYearRate} label="演示播放速度" />
    </div>
    <div className="range-row presentation-range">
      <input type="range" aria-label="演示日期轴" aria-valuetext={date} min={0} max={end} value={index}
        style={{ '--progress': `${index / end * 100}%` } as React.CSSProperties}
        onChange={event => {
          const next = playback.yearJump(Number(event.target.value));
          if (next !== undefined) onChange(next);
        }} />
    </div>
    <button className="ghost-button presentation-exit" type="button" ref={closeButton} onClick={onExit}>退出全屏</button>
  </header>;
}
