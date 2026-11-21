import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnnualDaylightChart } from './AnnualDaylightChart';
import { Globe, WorldMap } from './EarthView';
import { DaylightPanel } from './DaylightPanel';
import { daylightStateLabels, durationLabel } from './daylight-labels';
import { GuideDialog } from './GuideDialog';
import { HeightChart } from './HeightChart';
import { OrbitView } from './OrbitView';
import { PlacePicker } from './PlacePicker';
import { polarCapsAt, polarPalette } from './polar';
import { PresentationControls } from './PresentationControls';
import { SeasonRail } from './SeasonRail';
import { TimeBar } from './TimeBar';
import { daylightForLocation } from './daylight';
import {
  annualHeights, clockLabel, coordinateLabel, dailyHeights, dayBounds, firstYear, initialTime,
  lastYear, localAt, places, termsForLocalYear, zoneAt,
} from './local-time';
import type { Place } from './local-time';
import { observerColors } from './observers';
import type { ObserverSlot } from './observers';
import { altitudeAt, solarFrame, wrapLongitude } from './solar';
import type { Point } from './solar';
import { useGuide } from './useGuide';
import { usePlayback } from './usePlayback';
import { usePresentation } from './usePresentation';
import { TopicNav } from './topics/TopicControls';

const heightLabel = (height: number) => `${Math.abs(height) < .05 ? '0.0' : height.toFixed(1)}°`;
const polarLimitLabel = (latitude: number, hemisphere: number) =>
  hemisphere > 0 ? `北纬 ${latitude.toFixed(2)}° 以北` : `南纬 ${latitude.toFixed(2)}° 以南`;
const defaultComparison = (place: Place) =>
  places.find(candidate => candidate.name === (place.name === '特罗姆瑟' ? '南极点' : '特罗姆瑟')) ?? places[1];

export default function App({ active }: { active: boolean }) {
  const [time, setTime] = useState(initialTime);
  const [place, setPlace] = useState<Place>(places[0]);
  const [chosenComparison, setComparison] = useState<Place | null>(null);
  const [pickSlot, setPickSlot] = useState<ObserverSlot>('A');
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [showOrbit, setShowOrbit] = useState(false);
  const [showPolar, setShowPolar] = useState(true);
  const [chart, setChart] = useState<'day' | 'year'>('day');
  const [globeUnavailable, setGlobeUnavailable] = useState(false);
  const [centerRequest, setCenterRequest] = useState<Point | null>(null);
  const modelNotes = useRef<HTMLDetailsElement>(null);
  const guide = useGuide();
  const presentation = usePresentation();
  const { presenting } = presentation;
  const guideStep = guide.active?.id;
  const comparison = chosenComparison ?? (presenting || guideStep === 'comparison' ? defaultComparison(place) : null);
  const orbitVisible = showOrbit || presenting || guideStep === 'orbit';
  const polarVisible = showPolar || presenting || guideStep === 'map';

  const { zone } = place;
  const local = localAt(time, zone);
  const day = local.toPlainDate().toString();
  const year = local.year;
  const comparisonLocal = comparison ? localAt(time, comparison.zone) : null;
  const comparisonDay = comparisonLocal?.toPlainDate().toString();
  const bounds = useMemo(() => dayBounds(day, zone), [day, zone]);
  const playback = usePlayback(local, bounds, setTime);
  const pause = playback.pause;
  useEffect(() => {
    if (!active) pause();
  }, [active, pause]);
  const frame = useMemo(() => solarFrame(time), [time]);
  const polarCaps = useMemo(() => polarVisible ? polarCapsAt(frame.subsolar.lat) : null, [polarVisible, frame.subsolar.lat]);
  const altitude = altitudeAt(place, frame.direction);
  const daily = useMemo(() => presenting ? [] : dailyHeights(day, zone, place), [presenting, day, zone, place]);
  const daylight = useMemo(() => daylightForLocation(daily, place), [daily, place]);
  const comparisonDaylight = useMemo(() => {
    if (presenting || !comparison || !comparisonDay) return null;
    return daylightForLocation(dailyHeights(comparisonDay, comparison.zone, comparison), comparison);
  }, [presenting, comparison, comparisonDay]);
  const annual = useMemo(() => annualHeights(year, zone, place), [year, zone, place]);
  const termData = useMemo(() => termsForLocalYear(year, zone), [year, zone]);
  const noon = annual[local.dayOfYear - 1]?.sample;
  const openPresentation = (trigger: HTMLElement) => {
    playback.changeMode('year');
    presentation.open(trigger);
  };

  const commitTime = (value: number) => {
    playback.reset();
    const min = dayBounds(`${firstYear}-01-01`, zone).start;
    const max = dayBounds(`${lastYear + 1}-01-01`, zone).start - 1;
    setTime(Math.max(min, Math.min(max, value)));
  };
  const selectPlace = (next: Place) => {
    playback.reset();
    setPlace(next);
  };
  const selectComparison = (next: Place) => {
    playback.pause();
    setComparison(next);
  };
  const toggleComparison = () => {
    if (comparison) {
      setComparison(null);
      setPickSlot('A');
      return;
    }
    selectComparison(defaultComparison(place));
    setPickSlot('B');
  };
  const pickPoint = (coords: Point) => {
    if (presenting) return;
    const point = { lat: Number(coords.lat.toFixed(4)), lon: wrapLongitude(Number(coords.lon.toFixed(4))) };
    const next = { ...point, name: '地图选点', zone: zoneAt(point) };
    if (comparison && pickSlot === 'B') selectComparison(next);
    else selectPlace(next);
  };
  const fallBackToMap = useCallback(() => {
    setGlobeUnavailable(true);
    setView('map');
  }, []);

  const chartData = chart === 'day'
    ? { mode: 'day' as const, samples: daily, ...bounds, cursor: { time, height: altitude } }
    : { mode: 'year' as const, days: annual, index: local.dayOfYear - 1 };

  if (!active) return null;
  return <>
    <header className="masthead" inert={presenting}>
      <div className="shell masthead-inner">
        <div className="wordmark">
          <span className="orbit-logo" aria-hidden="true"><i /></span>
          <div><h1>日照地理</h1><p>太阳高度角 · 晨昏线 · 二十四节气</p></div>
        </div>
        <div className="masthead-actions">
          <button className="model-link guide-entry" type="button" ref={guide.launchButton} aria-haspopup="dialog"
            onClick={() => { playback.pause(); guide.open(); }}>使用引导</button>
          <a href="#model-notes" className="model-link" onClick={() => { if (modelNotes.current) modelNotes.current.open = true; }}>
            计算口径 <span aria-hidden="true">ⓘ</span>
          </a>
        </div>
      </div>
      <TopicNav active="solar" />
    </header>
    <main ref={presentation.stage} className={`shell explorer${presenting ? ' presentation-mode' : ''}`}
      role={presenting ? 'dialog' : undefined} aria-modal={presenting || undefined}
      aria-label={presenting ? '全屏演示' : undefined}
      style={{ '--site-a': observerColors.A, '--site-b': observerColors.B } as React.CSSProperties}>
      {presenting && <PresentationControls local={local}
        term={(termData.terms.findLast(term => term.time <= time) ?? termData.preceding).name}
        playback={playback} onChange={commitTime} closeButton={presentation.closeButton} onExit={presentation.exit} />}
      <TimeBar time={time} zone={zone} {...bounds} playback={playback} onChange={commitTime} onPresent={openPresentation} />
      <div className={`workspace${orbitVisible ? ' orbit-open' : ''}`}>
        <section className="panel earth-panel" aria-labelledby="earth-title" data-guide="map">
          <div className="earth-header">
            <h2 id="earth-title">全球昼夜</h2>
            <div className="earth-actions">
              <div className="segments" aria-label="地图视图">
                <button type="button" aria-pressed={view === 'globe'} disabled={globeUnavailable} onClick={() => {
                  setCenterRequest(null);
                  setView('globe');
                }}>3D 地球</button>
                <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>2D 地图</button>
              </div>
              <button type="button" className="ghost-button orbit-toggle" aria-expanded={orbitVisible}
                aria-controls={orbitVisible ? 'orbital-view' : undefined} onClick={() => setShowOrbit(open => !open)}>公转视图</button>
            </div>
          </div>
          <div className={`earth-stage ${view === 'map' ? 'flat' : 'spherical'}`}>
            {view === 'globe'
              ? <Globe frame={frame} location={place} comparison={comparison} polarCaps={polarCaps} onPick={pickPoint}
                  onUnavailable={fallBackToMap} centerRequest={centerRequest} />
              : <WorldMap frame={frame} location={place} comparison={comparison} polarCaps={polarCaps} onPick={pickPoint} presenting={presenting} />}
            <div className="sun-readout">
              <span><i className="sun-dot" aria-hidden="true" /> 太阳直射点</span>
              <strong data-testid="subsolar">{coordinateLabel(frame.subsolar)}</strong>
            </div>
            {view === 'globe' && <button type="button" className="ghost-button locate-button" onClick={() => {
              const point = pickSlot === 'B' && comparison ? comparison : place;
              setCenterRequest({ lat: point.lat, lon: point.lon });
            }}>{comparison ? `居中 ${pickSlot} 点` : '居中观测点'}</button>}
            {globeUnavailable && <span className="map-fallback" role="status">3D 暂不可用，已切换到 2D</span>}
          </div>
          <div className="earth-footer">
            <div className="legend" aria-label="地图图例">
              <span><i className="day-swatch" />昼</span>
              <span><i className="night-swatch" />夜</span>
              <span><i className="dawn-swatch" />晨线</span>
              <span><i className="dusk-swatch" />昏线</span>
              <span><i className="site-dot" />{comparison ? 'A 点' : '观测点'}</span>
              {comparison && <span><i className="compare-dot" />B 点</span>}
            </div>
            {comparison ? <div className="segments map-pick-target" aria-label="地图点选目标">
              {(['A', 'B'] as const).map(slot => <button key={slot} type="button"
                aria-pressed={pickSlot === slot} onClick={() => setPickSlot(slot)}>点选 {slot} 点</button>)}
            </div> : <small>{view === 'globe' ? '拖动旋转 · 点选地点' : '等经纬度投影 · 点选地点'}</small>}
            <div className="polar-controls">
              <button type="button" className="ghost-button polar-toggle" aria-pressed={polarVisible}
                title="按当前太阳赤纬估算持续昼夜范围" onClick={() => setShowPolar(show => !show)}>极昼极夜范围</button>
              {polarVisible && (polarCaps ? <div className="legend polar-legend" aria-label="极区范围图例">
                <span style={{ '--cap-color': polarPalette.day } as React.CSSProperties}>
                  <i className="polar-swatch" />极昼 <b data-testid="polar-day-limit">{polarLimitLabel(polarCaps.latitude, polarCaps.dayHemisphere)}</b>
                </span>
                <span style={{ '--cap-color': polarPalette.night } as React.CSSProperties}>
                  <i className="polar-swatch" />极夜 <b data-testid="polar-night-limit">{polarLimitLabel(polarCaps.latitude, -polarCaps.dayHemisphere)}</b>
                </span>
              </div> : <span className="polar-equinoctial" data-testid="polar-equinox">极昼和极夜范围缩至极点附近</span>)}
            </div>
          </div>
        </section>
        {orbitVisible && <OrbitView time={time} year={year} terms={termData.terms} onChange={commitTime} presenting={presenting} />}
        <aside className="panel inspector" aria-label="观测点、昼长和太阳高度角">
          <div className="observer-summary">
            <PlacePicker key={`${place.lat},${place.lon},${zone},${place.name}`} place={place} onChange={selectPlace}
              slot={comparison ? 'A' : undefined} />
            <DaylightPanel data={daylight} zone={zone} time={time} />
            <div className="comparison-actions">
              <button className="ghost-button" type="button" aria-expanded={comparison !== null}
                aria-controls={comparison ? 'comparison-observer' : undefined} onClick={toggleComparison}>
                {comparison ? '关闭两地对比' : '添加对比地点'}
              </button>
            </div>
            {comparison && comparisonLocal && <section className="comparison-observer" id="comparison-observer" aria-label="B 对比地点">
              <PlacePicker key={`${comparison.lat},${comparison.lon},${comparison.zone},${comparison.name}`}
                place={comparison} onChange={selectComparison} slot="B" />
              <div className="comparison-readout">
                <time dateTime={new Date(time).toISOString()} data-testid="comparison-local-time">
                  当地 {comparisonDay} {comparisonLocal.toPlainTime().toString({ smallestUnit: 'minute' })}
                </time>
                {comparisonDaylight && <span data-testid="comparison-daylight">
                  {daylightStateLabels[comparisonDaylight.regime]} · <b>{durationLabel(comparisonDaylight.duration, comparisonDaylight.end - comparisonDaylight.start)}</b>
                </span>}
              </div>
            </section>}
          </div>
          <section className="altitude-panel" aria-labelledby="altitude-title">
            <div className="metric-header">
              <div>
                <h2 id="altitude-title">太阳高度角</h2>
                <p className="hero-metric" data-testid="current-altitude">{heightLabel(altitude)}</p>
              </div>
              <div className="metric-caption">
                <span className="day-state" data-testid="day-state"><i className={altitude >= 0 ? 'sun-dot' : 'moon-dot'} aria-hidden="true" />
                  {Math.abs(altitude) < .05 ? '接近地平线' : altitude > 0 ? '地平线上方' : '地平线下方'}
                </span>
                <small>{clockLabel(time, zone, true)} 当地</small>
              </div>
            </div>
            <div className="segments chart-segments" aria-label="太阳高度角时间尺度">
              <button aria-pressed={chart === 'day'} onClick={() => setChart('day')}>日内变化</button>
              <button aria-pressed={chart === 'year'} onClick={() => setChart('year')}>全年正午</button>
            </div>
            <HeightChart data={chartData} zone={zone} onChange={commitTime} />
            <div className="chart-caption" data-testid="transit">
              <span>{chart === 'year' ? '选中日期的太阳上中天' : '当天太阳上中天'}</span>
              <strong>{noon ? `${clockLabel(noon.time, zone)} · ${heightLabel(noon.height)}` : '当天无上中天记录'}</strong>
            </div>
          </section>
        </aside>
      </div>
      <SeasonRail time={time} year={year} zone={zone} data={termData} onChange={commitTime} onYear={newYear => {
        const sameDate = local.with({ year: newYear }, { overflow: 'constrain', disambiguation: 'compatible' });
        commitTime(sameDate.epochMilliseconds);
      }} />
      <AnnualDaylightChart place={place} comparison={comparison} year={year} selected={local.dayOfYear - 1} terms={termData.terms} playback={playback}
        presenting={presenting} onPresent={openPresentation}
        onDate={(index, midpoint) => commitTime(annual[index]?.sample?.time ?? midpoint)} onTerm={commitTime} />
      <footer id="model-notes" className="site-footer">
        <details ref={modelNotes}>
          <summary>计算口径与数据来源</summary>
          <p>太阳高度角取日面中心的几何高度。几何晨昏线和昼长都以 0° 为界，昼长按观测点当地日期累计。实际日出、日落和曙暮光还受大气折射、太阳视半径和地形影响。</p>
          <p>地图上的极昼和极夜范围按当前时刻的太阳赤纬估算。假定赤纬在一次自转内恒定，边界纬度为 90° 减太阳赤纬的绝对值。观测点的昼长另按当天的实际太阳高度变化计算。</p>
          <p>节气由太阳视黄经计算。全年正午取太阳经过观测点上子午线的时刻。海域使用查询返回的固定偏移，时区边界附近可在观测点设置里手动修正。</p>
          <p>公转图把地球位置投影到黄道面。地轴倾角以轨道面法线为基准，俯视角度会改变图上看到的夹角。</p>
          <p><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noreferrer">Astronomy Engine</a> · <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a> · <a href="https://www.hko.gov.hk/tc/gts/time/24solarterms.htm" target="_blank" rel="noreferrer">香港天文台</a></p>
        </details>
        <span>底图数据 Natural Earth</span>
      </footer>
    </main>
    <GuideDialog guide={guide} />
  </>;
}
