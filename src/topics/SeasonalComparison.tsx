import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { GuideDialog } from '../GuideDialog';
import { seasonalGuide } from '../guide';
import type { Point } from '../solar';
import { useGuide } from '../useGuide';
import { ColorLegend, FieldMap, magnitude, scales } from './FieldMap';
import type { Scale, Vectors } from './FieldMap';
import { Segments, Timeline, TopicHeader } from './TopicControls';
import { climateMonth, coordinate, grids, loadTopic, months, oceanMonth, sample, windLevels, windMonth } from './topic-data';
import type { Grid } from './topic-data';

type ComparisonData = { ocean: Float32Array; atmosphere: Float32Array; climate: Float32Array };

function ComparisonMap({ name, metric, grid, field, scale, unit, digits, selection, onPick, vectors, tools, guideTarget }: {
  name: string;
  metric: string;
  grid: Grid;
  field: Float32Array;
  scale: Scale;
  unit: string;
  digits: number;
  selection: Point;
  onPick: (point: Point) => void;
  vectors?: Vectors;
  tools?: ReactNode;
  guideTarget?: string;
}) {
  const value = sample(field, grid, selection);
  return <section className="panel topic-card comparison-map" aria-label={name}>
    <div className="topic-card-heading"><h2>{name}</h2>{tools}</div>
    <div className="comparison-map-body" data-guide={guideTarget}>
      <FieldMap label={`${name}地图`} grid={grid} field={field} scale={scale}
        selection={selection} onPick={onPick} vectors={vectors} />
      <div className="comparison-map-key">
        <ColorLegend scale={scale} label={metric} />
        <div className="comparison-map-value">
          <span>选点读数</span>
          <strong>{Number.isFinite(value) ? `${value.toFixed(digits)} ${unit}` : '无数据'}</strong>
        </div>
      </div>
    </div>
  </section>;
}

function Comparison({ data, guideOpen }: { data: ComparisonData; guideOpen: boolean }) {
  const [month, setMonth] = useState(0);
  const [selection, setSelection] = useState<Point>({ lat: 33, lon: 135 });
  const [level, setLevel] = useState<typeof windLevels[number]>(850);
  const currents = useMemo(() => oceanMonth(data.ocean, month), [data.ocean, month]);
  const winds = useMemo(() => windMonth(data.atmosphere, month, level), [data.atmosphere, month, level]);
  const currentSpeed = useMemo(() => magnitude(currents), [currents]);
  const windSpeed = useMemo(() => magnitude(winds), [winds]);
  const [, rainfall] = useMemo(() => climateMonth(data.climate, month), [data.climate, month]);

  return <>
    <Timeline labels={months} index={month} onSelect={setMonth} label="对比月份" loop={false} playLabel="播放全年"
      paused={guideOpen} guideTargets={{ choices: 'compare-months', playback: 'compare-playback' }} />
    <div className="comparison-location">
      <p>点选任一地图，三图同步标出同一位置。</p>
      <span className="topic-coordinate" data-testid="comparison-position">
        {coordinate(selection.lat, 'lat')} · {coordinate(selection.lon, 'lon')}
      </span>
    </div>
    <div className="comparison-maps">
      <ComparisonMap name="近表层洋流" grid={grids.ocean} field={currentSpeed} vectors={currents}
        metric="流速" unit="m/s" digits={2} scale={scales.oceanSpeed} selection={selection} onPick={setSelection} guideTarget="compare-pick" />
      <ComparisonMap name="大气环流" grid={grids.atmosphere} field={windSpeed} vectors={winds}
        metric="水平风速" unit="m/s" digits={1} scale={scales.wind} selection={selection} onPick={setSelection}
        tools={<div data-guide="compare-pressure">
          <Segments label="对比风场气压层" options={[[850, '850 hPa'], [200, '200 hPa']]} value={level} onSelect={setLevel} />
        </div>} />
      <ComparisonMap name="气候降水" grid={grids.climate} field={rainfall} metric="月降水量" unit="mm/月" digits={0}
        scale={scales.rain} selection={selection} onPick={setSelection} />
    </div>
    <footer className="topic-source comparison-source">
      <p>箭头指向水流或空气的运动方向。各图按公历月份对齐多年统计值。风场和降水采用 1991–2020 年再分析平均值，洋流采用截至 2023 年 2 月的漂流浮标气候态。</p>
      <a href="https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_monthlymeans/index.html" target="_blank" rel="noreferrer">NOAA 漂流浮标 v3.10</a>
      <a href="https://doi.org/10.1016/j.dsr.2017.04.009" target="_blank" rel="noreferrer">Laurindo 等（2017）</a>
      <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">洋流 CC BY 4.0</a>
      <a href="https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html" target="_blank" rel="noreferrer">NOAA PSL 再分析</a>
    </footer>
  </>;
}

export default function SeasonalComparison() {
  const [data, setData] = useState<ComparisonData | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const guide = useGuide(seasonalGuide);

  useEffect(() => {
    let active = true;
    void Promise.all([loadTopic('ocean'), loadTopic('atmosphere'), loadTopic('climate')]).then(
      ([ocean, atmosphere, climate]) => { if (active) setData({ ocean, atmosphere, climate }); },
      () => { if (active) setError(true); },
    );
    return () => { active = false; };
  }, [attempt]);

  return <>
    <TopicHeader topic="compare" period="洋流 · 风场 · 降水" compact actions={
      <button type="button" className="model-link guide-entry" ref={guide.launchButton}
        disabled={!data} aria-haspopup="dialog" onClick={guide.open}>使用引导</button>
    } />
    <main className="shell topic-page comparison-page">
      {data ? <Comparison data={data} guideOpen={guide.index !== null} /> : error ? <div className="panel topic-status" role="alert">
        季节对比数据加载失败。
        <button type="button" className="ghost-button" onClick={() => {
          setError(false);
          setAttempt(attempt + 1);
        }}>重试</button>
      </div> : <div className="panel topic-status" role="status">正在加载三张地图的数据…</div>}
    </main>
    <GuideDialog guide={guide} />
  </>;
}
