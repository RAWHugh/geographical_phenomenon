import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareCanvas, useCanvasSize } from './canvas';
import { daylightStateLabels, durationLabel } from './daylight-labels';
import { localAt } from './local-time';
import { observerColors } from './observers';
import type { ObserverSlot } from './observers';
import { polarPalette } from './polar';
import { useAnnualDaylight } from './useAnnualDaylight';
import { YearRatePicker } from './YearRatePicker';
import type { usePlayback } from './usePlayback';
import type { AnnualDaylight, DaylightDay, PolarRegime } from './annual-daylight';
import type { Place } from './local-time';
import type { SolarTerm } from './solar';

const hourMs = 3_600_000;
const normalPlot = { left: 44, right: 23, bottom: 29, top: 52, comparisonTop: 82, track: 54 };
const compactPlot = { left: 33, right: 12, bottom: 21, top: 25, comparisonTop: 46, track: 25 };
const periodColors: Record<PolarRegime, string> = { 'polar-day': polarPalette.day, 'polar-night': polarPalette.night };

type TermMark = SolarTerm & { index: number; label: string };
type ComparisonCurve = { name: string; data: AnnualDaylight | null | undefined };

function dateLabel(date: string, year?: number) {
  const [y, m, d] = date.split('-').map(Number);
  return `${y === year ? '' : `${y} 年 `}${m} 月 ${d} 日`;
}

function paintChart(
  ctx: CanvasRenderingContext2D, width: number, height: number, data: AnnualDaylight,
  terms: TermMark[], selected: number, hovered: number | null, maxHours: number,
  comparison: ComparisonCurve | null, layout: typeof normalPlot,
) {
  const { left, right, bottom } = layout;
  const top = comparison ? layout.comparisonTop : layout.top;
  const plotBottom = height - bottom;
  if (width - left <= right || plotBottom <= top) return;
  const step = (width - left - right) / data.days.length;
  const x = (index: number) => left + (index + .5) * step;
  const y = (hours: number) => plotBottom - hours / maxHours * (plotBottom - top);
  const vertical = (at: number, color: string) => {
    ctx.beginPath();
    ctx.moveTo(at, top);
    ctx.lineTo(at, plotBottom);
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 1;
  const series = comparison
    ? [{ slot: 'A' as const, data }, { slot: 'B' as const, data: comparison.data }]
    : [{ slot: 'A' as const, data }];
  if (comparison) {
    series.forEach(({ slot, data: values }, row) => {
      const trackY = layout.track + (layout === compactPlot ? 9 : 12) * row;
      ctx.fillStyle = '#182c3b';
      const bandHeight = layout === compactPlot ? 5 : 7;
      ctx.fillRect(left, trackY, width - left - right, bandHeight);
      ctx.fillStyle = observerColors[slot];
      ctx.font = 'bold 11px Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(slot, left - 9, trackY + 3.5);
      for (const period of values?.periods ?? []) {
        ctx.fillStyle = periodColors[period.regime];
        ctx.fillRect(x(period.first) - step / 2, trackY, (period.last - period.first + 1) * step, bandHeight);
      }
    });
  } else {
    for (const period of data.periods) {
      const color = periodColors[period.regime];
      const from = x(period.first) - step / 2;
      const to = x(period.last) + step / 2;
      ctx.globalAlpha = .14;
      ctx.fillStyle = color;
      ctx.fillRect(from, top, to - from, plotBottom - top);
      ctx.globalAlpha = .58;
      vertical(from, color);
      vertical(to, color);
      ctx.globalAlpha = 1;
    }
  }
  ctx.font = '11px Consolas, monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const shortPlot = plotBottom - top < 85;
  const hours = shortPlot ? [0, 12, maxHours] : [0, 6, 12, 18, 24];
  if (!shortPlot && maxHours > 24) {
    // Keep space between the upper ticks on a long civil day.
    if (maxHours < 27) hours.pop();
    hours.push(maxHours);
  }
  for (const hour of hours) {
    ctx.beginPath();
    ctx.moveTo(left, y(hour));
    ctx.lineTo(width - right, y(hour));
    ctx.strokeStyle = '#304755';
    ctx.stroke();
    ctx.fillStyle = '#adc1cc';
    ctx.fillText(String(hour), left - 9, y(hour));
  }
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('小时', left - 9, layout === compactPlot ? 13 : 36);
  ctx.textAlign = 'center';
  data.days.forEach(({ date }, index) => {
    if (!date.endsWith('-01')) return;
    const position = x(index);
    vertical(position, '#263d4b');
    const month = Number(date.slice(5, 7));
    if (width >= 420 || (month - 1) % 3 === 0) {
      ctx.fillStyle = '#adc1cc';
      ctx.fillText(`${month}月`, position, plotBottom + (layout === compactPlot ? 11 : 15));
    }
  });
  ctx.setLineDash([2, 4]);
  for (const term of terms) vertical(x(term.index), term.longitude % 90 === 0 ? '#76674e' : '#425160');
  ctx.setLineDash([]);

  for (const { slot, data: values } of series) {
    if (!values) continue;
    ctx.beginPath();
    let started = false;
    values.days.forEach(({ sample }, index) => {
      if (!sample) {
        started = false;
        return;
      }
      if (started) ctx.lineTo(x(index), y(sample.duration / hourMs));
      else ctx.moveTo(x(index), y(sample.duration / hourMs));
      started = true;
    });
    ctx.strokeStyle = observerColors[slot];
    ctx.lineWidth = slot === 'A' && comparison ? 2.5 : 2;
    ctx.setLineDash(slot === 'B' ? [6, 4] : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.lineWidth = 1;
  for (const index of new Set([selected, hovered])) {
    if (index === null) continue;
    const color = index === selected ? '#ffd08b' : '#cae5e7';
    vertical(x(index), color);
    for (const { slot, data: values } of series) {
      const sample = values?.days[index]?.sample;
      if (!sample) continue;
      const atX = x(index);
      const atY = y(sample.duration / hourMs);
      ctx.beginPath();
      if (slot === 'B') {
        ctx.moveTo(atX, atY - 5);
        ctx.lineTo(atX + 5, atY);
        ctx.lineTo(atX, atY + 5);
        ctx.lineTo(atX - 5, atY);
        ctx.closePath();
        ctx.strokeStyle = observerColors.B;
      } else {
        ctx.arc(atX, atY, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = comparison ? observerColors.A : color;
        ctx.fill();
        ctx.strokeStyle = '#112334';
      }
      ctx.stroke();
    }
  }
}

function DaylightValue({ day, slot }: { day: DaylightDay; slot?: ObserverSlot }) {
  const sample = day.sample;
  return <span className="annual-day-value">
    {slot && <b className={slot === 'A' ? 'series-a' : 'series-b'}>{slot}</b>}
    {sample ? <>
      <strong className={slot === 'B' ? 'series-b' : undefined} data-testid={slot ? `annual-value-${slot}` : undefined}>{durationLabel(sample.duration, sample.span)}</strong>
      <span>{daylightStateLabels[sample.regime]}</span>
    </> : <span>当地日历跳过了这一天</span>}
  </span>;
}

function AnnualPeriods({ data, year, slot, name }: {
  data: AnnualDaylight;
  year: number;
  slot?: ObserverSlot;
  name?: string;
}) {
  return <div className="annual-period-group">
    {slot && <h3 className={slot === 'A' ? 'series-a' : 'series-b'}>{slot} {name}</h3>}
    <div className="annual-periods">
      {(['polar-day', 'polar-night'] as const).map(regime => {
        const periods = data.periods.filter(period => period.regime === regime);
        const testId = `annual-${slot === 'B' ? 'comparison-' : ''}${regime}-dates`;
        return <div className="annual-period" key={regime} style={{ '--period-color': periodColors[regime] } as React.CSSProperties}>
          <span><i />{daylightStateLabels[regime]}</span>
          <div className="annual-period-dates" data-testid={testId}>
            {periods.length ? periods.map(period => {
              const sameYear = period.starts.slice(0, 4) === period.ends.slice(0, 4);
              const referenceYear = sameYear ? year : undefined;
              return <span key={period.first}>
                <time dateTime={period.starts}>{dateLabel(period.starts, referenceYear)}</time>
                {period.ends !== period.starts && <> 至 <time dateTime={period.ends}>{dateLabel(period.ends, referenceYear)}</time></>}
              </span>;
            }) : <span>本年 0 天</span>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function AnnualDaylightPlot({ data, comparison, placeName, terms, year, selected, playing, presenting, onSelect, onTerm }: {
  data: AnnualDaylight;
  comparison: ComparisonCurve | null;
  placeName: string;
  terms: TermMark[];
  year: number;
  selected: number;
  playing: boolean;
  presenting: boolean;
  onSelect: (index: number) => void;
  onTerm: (time: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const size = useCanvasSize(canvas);
  const dense = presenting && (size.width < 730 || size.height < 205);
  const layout = dense ? compactPlot : normalPlot;
  const { left, right, bottom } = layout;
  const [hovered, setHovered] = useState<number | null>(null);
  const preview = playing ? null : hovered;
  const comparisonData = comparison?.data;
  const maxHours = useMemo(() => {
    const duration = (day: DaylightDay) => Math.ceil((day.sample?.duration ?? 0) / hourMs);
    return Math.max(24, ...data.days.map(duration), ...(comparisonData?.days ?? []).map(duration));
  }, [data, comparisonData]);
  const index = preview ?? selected;
  const readout = data.days[index];
  const comparisonReadout = comparisonData?.days[index];
  const isComparison = comparison !== null;

  useEffect(() => {
    const ctx = prepareCanvas(canvas.current!, size);
    if (ctx) paintChart(ctx, size.width, size.height, data, terms, selected, preview, maxHours, comparison, layout);
  }, [size, data, terms, selected, preview, maxHours, comparison, layout]);
  useEffect(() => {
    const view = scroller.current;
    if (!view || presenting || size.width <= view.clientWidth) return;
    const position = left + (selected + .5) * (size.width - left - right) / data.days.length;
    if (position < view.scrollLeft + left || position > view.scrollLeft + view.clientWidth - right) {
      view.scrollLeft = position - view.clientWidth / 2;
    }
  }, [size.width, selected, data.days.length, left, right, presenting]);

  const pointerDay = (event: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (y < (isComparison ? layout.comparisonTop : layout.top) || y > rect.height - bottom || x < left || x >= rect.width - right) return null;
    return Math.floor((x - left) / (rect.width - left - right) * data.days.length);
  };

  return <>
    <div className="annual-readout">
      {isComparison ? <div className="annual-series-legend" aria-label="昼长曲线图例">
        <span className="annual-line-legend series-a"><i />A {placeName}</span>
        <span className="annual-line-legend series-b"><i />B {comparison.name}</span>
      </div> : <span className="annual-line-legend"><i />昼长</span>}
      {readout && <div className="annual-value">
        <time dateTime={readout.date} data-testid="annual-cursor-date">{dateLabel(readout.date, year)}</time>
        <DaylightValue day={readout} slot={isComparison ? 'A' : undefined} />
        {comparisonReadout && <DaylightValue day={comparisonReadout} slot="B" />}
      </div>}
    </div>
    <div className="annual-scroll" ref={scroller}>
      <div className={`annual-plot${isComparison ? ' compare-plot' : ''}${dense ? ' dense-plot' : ''}`}>
        <canvas className="annual-canvas" ref={canvas} tabIndex={0} role="img"
          aria-label={isComparison
            ? '两地全年昼长曲线。A 点为青色实线，B 点为粉色虚线。横轴对齐两地的当地月日。'
            : '全年每日昼长曲线，横轴为当地日期，纵轴为小时。点击曲线选日期，也可用方向键逐日选取。'}
          onPointerMove={event => { if (!playing && event.pointerType === 'mouse') setHovered(pointerDay(event)); }}
          onPointerLeave={() => setHovered(null)}
          onClick={event => {
            const index = pointerDay(event);
            if (index !== null) onSelect(index);
          }}
          onKeyDown={event => {
            const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
            if (!step) return;
            event.preventDefault();
            setHovered(null);
            for (let next = selected + step; next >= 0 && next < data.days.length; next += step) {
              if (data.days[next].sample) {
                onSelect(next);
                break;
              }
            }
          }} />
        {size.width > 0 && (dense ? terms.filter(term => term.longitude % 90 === 0) : terms).map((term, index) => <button className={`annual-term${term.longitude % 90 === 0 ? ' annual-major' : ''}`}
          key={term.time} type="button" title={term.label} aria-label={`全年曲线 ${term.label}`}
          aria-current={term.index === selected ? 'date' : undefined}
          style={{ left: left + (term.index + .5) * (size.width - left - right) / data.days.length, top: dense || index % 2 === 0 ? 1 : 24 }}
          onFocus={() => setHovered(term.index)} onBlur={() => setHovered(null)}
          onClick={() => onTerm(term.time)}>{term.name}</button>)}
      </div>
    </div>
    {!presenting && <div className={isComparison ? 'annual-compare-periods' : undefined}>
      <AnnualPeriods data={data} year={year} slot={isComparison ? 'A' : undefined} name={placeName} />
      {comparison && comparisonData && <AnnualPeriods data={comparisonData} year={year} slot="B" name={comparison.name} />}
    </div>}
  </>;
}

export function AnnualDaylightChart({ place, comparison, year, selected, terms, playback, presenting, onPresent, onDate, onTerm }: {
  place: Place;
  comparison: Place | null;
  year: number;
  selected: number;
  terms: SolarTerm[];
  playback: ReturnType<typeof usePlayback>;
  presenting: boolean;
  onPresent: (trigger: HTMLElement) => void;
  onDate: (index: number, midpoint: number) => void;
  onTerm: (time: number) => void;
}) {
  const { data, retry } = useAnnualDaylight(year, place.zone, place);
  const same = comparison?.lat === place.lat && comparison.lon === place.lon && comparison.zone === place.zone;
  const second = useAnnualDaylight(year, comparison?.zone ?? place.zone, same ? null : comparison);
  const comparisonData = same ? data : second.data;
  const comparisonName = comparison?.name;
  const curve = useMemo(() => comparisonName ? { name: comparisonName, data: comparisonData } : null, [comparisonName, comparisonData]);
  const playing = playback.playing && playback.mode === 'year';
  const marks = useMemo(() => terms.map(term => {
    const local = localAt(term.time, place.zone);
    const clock = local.toPlainTime().toString({ smallestUnit: 'minute' });
    return { ...term, index: local.dayOfYear - 1, label: `${term.name} ${local.month} 月 ${local.day} 日 ${clock}` };
  }), [terms, place.zone]);
  return <section className="panel annual-daylight" id="annual-daylight" aria-labelledby="annual-daylight-title" data-guide="comparison">
    <div className="annual-header">
      <div>
        <h2 id="annual-daylight-title">全年昼长</h2>
        <span>{comparison ? `${year} 年 · 两地对比` : `${place.name} · ${year} 年 · 当地日期`}</span>
      </div>
      <div className="annual-transport">
        <button className="ghost-button annual-play-button" type="button"
          aria-label={playing ? '暂停全年曲线' : '播放全年曲线'} onClick={() => playback.toggle('year')}>
          {playing ? '暂停全年' : '播放全年'}
        </button>
        <YearRatePicker value={playback.yearRate} onChange={playback.setYearRate} label="曲线播放速度" />
        <button className="ghost-button annual-play-button" type="button" aria-label="从全年曲线打开全屏演示" data-guide="presentation"
          onClick={event => onPresent(event.currentTarget)}>全屏演示</button>
        <a className="year-chart-link" href="#earth-title">查看地图</a>
      </div>
    </div>
    {comparison && (!presenting || comparisonData == null) && <div className="annual-comparison-note">
      {!presenting && <span>按两地各自的当地月日对齐，节气标记和日期跳转以 A 点为准。</span>}
      {!same && (comparisonData === null ? <span role="alert">B 点昼长计算失败 <button className="ghost-button" onClick={second.retry}>重试 B 点</button></span>
        : comparisonData === undefined && <span role="status">正在计算 B 点昼长…</span>)}
    </div>}
    {data ? <AnnualDaylightPlot key={`${year}/${place.zone}/${place.lat}/${place.lon}`}
      data={data} comparison={curve} placeName={place.name} terms={marks} year={year} selected={selected} playing={playing}
      presenting={presenting} onTerm={onTerm}
      onSelect={index => {
        const sample = data.days[index].sample;
        if (sample) onDate(index, sample.midpoint);
      }} /> : <div className="annual-placeholder">
      {data === null ? <><p role="alert">全年昼长计算失败</p><button className="ghost-button" onClick={retry}>重试</button></>
        : <p role="status">正在计算当地每日的昼长…</p>}
    </div>}
  </section>;
}
