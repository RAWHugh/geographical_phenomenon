import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Point } from '../solar';
import { ColorLegend, FieldMap, magnitude, scales } from './FieldMap';
import type { Cut } from './FieldMap';
import { OrogenySection, PlateGlobe } from './Mountains';
import { ClimateProfile, CirculationSection } from './TopicCharts';
import { Readout, Readouts, Segments, Timeline, TopicHeader, useMotionPreference } from './TopicControls';
import { ages, bearing, climateMonth, coordinate, grids, layers, levels, loadTopic, months, oceanMonth, sample, windLevels, windMonth } from './topic-data';
import type { PlateFrame, Topic } from './topic-data';

const details = {
  ocean: { summary: '观察海水怎样沿着大洋边缘和赤道流动。底色可切换为海温，箭头始终指向流去的方向。',
    period: '浮标观测气候态 · 数据截至 2023 年 2 月' },
  atmosphere: { summary: '对比低层与高层风场，再沿纬度观察空气在不同气压层之间的平均运动。',
    period: 'NCEP／NCAR 再分析 · 1991–2020 月平均' },
  mountains: { summary: '沿着印度板块的北移轨迹，观察它如何接近欧亚大陆，并了解喜马拉雅山系的形成。',
    period: '板块重建 · 距今 100 百万年至今' },
  climate: { summary: '沿一条经线或纬线查看气温、降水和陆地高程，比较纬度、海陆位置和地形的影响。',
    period: 'NCEP／NCAR 气候平均值 · 1991–2020' },
};
const ncepLink = 'https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html';
const format = (value: number, decimals: number, unit: string) => Number.isFinite(value) ? `${value.toFixed(decimals)} ${unit}` : '—';
const locationText = ({ lon, lat }: Point) => `${coordinate(lat, 'lat')} · ${coordinate(lon, 'lon')}`;
const timeLabels = ages.map(age => `${age} Ma`);

function Section({ name, tools, children }: { name: string; tools?: ReactNode; children: ReactNode }) {
  return <section className="panel topic-card" aria-label={name}>
    <div className="topic-card-heading"><h2>{name}</h2>{tools}</div>
    {children}
  </section>;
}

function SourceLink({ children, href }: { children: ReactNode; href: string }) {
  return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
}

const oceanPresets = [
  { name: '黑潮', lon: 135, lat: 33 },
  { name: '湾流', lon: -72, lat: 37 },
  { name: '赤道太平洋', lon: -130, lat: 1 },
];

function Ocean({ data }: { data: Float32Array }) {
  const [month, setMonth] = useState(0);
  const [selection, pick] = useState<Point>(oceanPresets[0]);
  const [mode, setMode] = useState<'speed' | 'temperature'>('speed');
  const reducedMotion = useMotionPreference();
  const [showMotion, setShowMotion] = useState(() => !reducedMotion);
  const grid = grids.ocean;
  const vectors = useMemo(() => oceanMonth(data, month), [data, month]);
  const { u, v, temperature } = vectors;
  const speed = useMemo(() => magnitude(vectors), [vectors]);
  const current = sample(speed, grid, selection);
  const direction = current > .005 ? bearing(sample(u, grid, selection), sample(v, grid, selection)) : NaN;
  const seaTemperature = sample(temperature, grid, selection);
  const showingSpeed = mode === 'speed';
  const scale = showingSpeed ? scales.oceanSpeed : scales.seaTemperature;
  const animate = showMotion && !reducedMotion;
  return <>
    <Timeline labels={months} index={month} onSelect={setMonth} label="观测月份" />
    <div className="topic-workspace">
      <Section name="全球近表层洋流" tools={
        <Segments label="洋流底色" options={[[ 'speed', '流速' ], [ 'temperature', '海表温度' ]]} value={mode} onSelect={setMode} />
      }>
        <FieldMap label="全球洋流地图" grid={grid} scale={scale} field={showingSpeed ? speed : temperature}
          vectors={vectors} animate={animate} selection={selection} onPick={pick} />
        <div className="topic-map-footer">
          <ColorLegend scale={scale} label={showingSpeed ? '近表层流速' : '海表温度'} />
          <button className="ghost-button" type="button" disabled={reducedMotion} aria-pressed={animate}
            onClick={() => setShowMotion(!showMotion)}>流向动画</button>
        </div>
      </Section>
      <Section name="观测点" tools={<span className="topic-coordinate" data-testid="topic-position">{locationText(selection)}</span>}>
        <Readouts>
          <Readout label="近表层流速" value={format(current, 2, 'm/s')} />
          <Readout label="流向（由正北顺时针）" value={Number.isFinite(direction) ? `${direction}°` : '—'} />
          <Readout label="海表温度" value={format(seaTemperature, 1, '°C')} />
        </Readouts>
        <div className="topic-card-copy">
          {!Number.isFinite(current) && !Number.isFinite(seaTemperature) && <p role="status">该网格无浮标气候态数据。</p>}
          <div className="topic-presets" role="group" aria-label="洋流观测点预设">
            {oceanPresets.map(place => <button className="ghost-button" type="button" key={place.name}
              onClick={() => pick(place)}>{place.name}</button>)}
          </div>
          <p>点选海域读取格点值。动画沿平均流向推进，运动速度经过放大。</p>
        </div>
      </Section>
    </div>
    <footer className="topic-source">
      <p>使用 1° 网格显示 NOAA / AOML 全球漂流浮标月气候态 v3.10。灰暗区域表示陆地或缺测。近表层流速和海表温度的有效覆盖范围可能不同。</p>
      <SourceLink href="https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_monthlymeans/index.html">NOAA 全球漂流浮标计划</SourceLink>
      <SourceLink href="https://doi.org/10.1016/j.dsr.2017.04.009">Laurindo 等（2017）</SourceLink>
      <SourceLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</SourceLink>
    </footer>
  </>;
}

function Atmosphere({ data }: { data: Float32Array }) {
  const [month, setMonth] = useState(0);
  const [level, setLevel] = useState<typeof windLevels[number]>(850);
  const [selection, pick] = useState<Point>({ lat: 36, lon: 145 });
  const grid = grids.atmosphere;
  const plane = grid.width * grid.height;
  const slice = levels.length * grid.height;
  const vectors = useMemo(() => windMonth(data, month, level), [data, month, level]);
  const { u, v } = vectors;
  const [meridional, vertical] = useMemo(() => layers(data.subarray(48 * plane), slice, month * 2, 2), [data, plane, month, slice]);
  const speed = useMemo(() => magnitude(vectors), [vectors]);
  return <>
    <Timeline labels={months} index={month} onSelect={setMonth} label="观测月份" />
    <div className="topic-workspace">
      <Section name="全球等压面风场" tools={
        <Segments label="等压面高度" options={[[850, '850 hPa 低层'], [200, '200 hPa 高层']]} value={level} onSelect={setLevel} />
      }>
        <FieldMap label={`${level} hPa 全球风场地图`} grid={grid} scale={scales.wind}
          field={speed} vectors={vectors} selection={selection} onPick={pick} />
        <div className="topic-map-footer"><ColorLegend scale={scales.wind} label="水平风速" /></div>
      </Section>
      <Section name="等压面观测点" tools={<span className="topic-coordinate" data-testid="topic-position">{locationText(selection)}</span>}>
        <Readouts>
          <Readout label="气压层" value={`${level} hPa`} />
          <Readout label="水平风速" value={format(sample(speed, grid, selection), 1, 'm/s')} />
          <Readout label="东向风分量" value={format(sample(u, grid, selection), 1, 'm/s')} />
          <Readout label="北向风分量" value={format(sample(v, grid, selection), 1, 'm/s')} />
        </Readouts>
        <div className="topic-card-copy">
          <p>{Number.isFinite(sample(speed, grid, selection)) ? '箭头指向空气运动方向。选择另一个等压面，对比低层风与高空急流。'
            : '所选等压面位于该网格的月均地面以下，或该网格无有效数据。'}</p>
        </div>
      </Section>
    </div>
    <Section name="纬度–气压剖面" tools={<span className="topic-coordinate">气压 hPa ↑ 高度增加</span>}>
      <CirculationSection vertical={vertical} meridional={meridional} activeLevel={level} />
      <div className="topic-map-footer">
        <ColorLegend scale={scales.omega} label="气压垂直速度 · 负值上升 / 正值下沉" />
        <p>对各经度有效格点取平均。箭头的水平、垂直分量分别放大。</p>
      </div>
    </Section>
    <footer className="topic-source">
      <p>数据来自 NOAA PSL 的 NCEP／NCAR 再分析 1991–2020 月气候态，按 2.5° 网格展示。低于月均地面的等压面在地图及剖面中掩蔽。</p>
      <SourceLink href={ncepLink}>NOAA PSL 再分析</SourceLink>
      <SourceLink href="https://www.noaa.gov/jetstream/global/global-atmospheric-circulations">NOAA 全球大气环流说明</SourceLink>
    </footer>
  </>;
}

function Mountains({ frames }: { frames: PlateFrame[] }) {
  const [index, setIndex] = useState(0);
  return <>
    <Timeline labels={timeLabels} index={index} onSelect={setIndex} label="距今年代" loop={false} />
    <div className="topic-workspace">
      <Section name="全球板块重建" tools={<span className="topic-coordinate">Müller 2019</span>}>
        <PlateGlobe frames={frames} index={index} />
      </Section>
      <Section name="喜马拉雅造山剖面" tools={<span className="topic-coordinate">教学示意 · 无比例尺</span>}>
        <OrogenySection age={frames[index].age} />
      </Section>
    </div>
    <footer className="topic-source">
      <p>地球视图每隔 10 百万年显示一帧，使用板块模型重建大陆轮廓、边界和两个参考点。大陆轮廓随板块旋转，古海岸、地形与剖面的细节需由其他资料约束。</p>
      <SourceLink href="https://gwsdoc.gplates.org/models/#muller2019">EarthByte Müller 等（2019）板块模型</SourceLink>
      <SourceLink href="https://pubs.usgs.gov/of/2010/1083/j/">USGS 喜马拉雅及周边地震构造</SourceLink>
      <SourceLink href="https://creativecommons.org/licenses/by-sa/4.0/">重建几何 CC BY-SA 4.0</SourceLink>
    </footer>
  </>;
}

const cuts = [
  { name: '东亚 105°E', axis: 'lon', position: { lon: 105, lat: 35 } },
  { name: '欧亚 40°N', axis: 'lat', position: { lon: 85, lat: 40 } },
  { name: '赤道 0°', axis: 'lat', position: { lon: 24, lat: 0 } },
] as const;

function Climate({ data }: { data: Float32Array }) {
  const [month, setMonth] = useState(0);
  const [selection, pick] = useState<Point>(cuts[0].position);
  const [axis, setAxis] = useState<Cut['axis']>('lon');
  const [mode, setMode] = useState<'temperature' | 'rain'>('temperature');
  const grid = grids.climate;
  const plane = grid.width * grid.height;
  const fields = useMemo(() => [...climateMonth(data, month), data.subarray(24 * plane)], [data, month, plane]);
  const cut = { axis, value: selection[axis] };
  const label = coordinate(cut.value, cut.axis);
  const metricLabel = mode === 'temperature' ? '月均气温' : '月降水量';
  const max = axis === 'lat' ? 89 : 179;
  return <>
    <Timeline labels={months} index={month} onSelect={setMonth} label="观测月份" />
    <div className="topic-climate-workspace">
      <Section name="全球气候平均值" tools={
        <Segments label="气候地图着色" options={[[ 'temperature', '月均气温' ], [ 'rain', '月降水量' ]]} value={mode} onSelect={setMode} />
      }>
        <FieldMap label="全球气候地图" grid={grid} scale={scales[mode]} field={fields[mode === 'temperature' ? 0 : 1]}
          cut={cut} selection={selection} onPick={pick} />
        <div className="topic-map-footer">
          <ColorLegend scale={scales[mode]} label={metricLabel} />
          <p>点选地图移动剖面，或用经纬度滑块微调。</p>
        </div>
      </Section>
      <Section name={`气候剖面 · ${label}`} tools={
        <Segments label="剖面方向" options={[[ 'lon', '固定经度（南北）' ], [ 'lat', '固定纬度（东西）' ]]} value={axis} onSelect={setAxis} />
      }>
        <div className="topic-cut-controls">
          <label className="topic-cut-range">
            <span>{axis === 'lon' ? '经度' : '纬度'} <strong data-testid="cut-value">{label}</strong></span>
            <input type="range" min={axis === 'lon' ? -180 : -89} max={max} value={cut.value}
              aria-valuetext={label} onChange={event => pick({ ...selection, [axis]: Number(event.target.value) })} />
          </label>
          <div className="topic-presets" role="group" aria-label="气候剖面预设">
            {cuts.map(preset => <button type="button" className="ghost-button" key={preset.name}
              onClick={() => { setAxis(preset.axis); pick(preset.position); }}>{preset.name}</button>)}
          </div>
        </div>
        <ClimateProfile fields={fields} cut={cut} selection={selection} onPick={pick} />
        <div className="topic-map-footer">
          <p>剖面按{axis === 'lon' ? '南极到北极' : '西经 180° 到东经 180°'}排列。点击曲线读取同一位置的三项指标。</p>
          <span className="topic-coordinate" data-testid="topic-position">{locationText(selection)}</span>
        </div>
      </Section>
    </div>
    <footer className="topic-source">
      <p>气温为地面上方 2 米空气温度，降水为月总量的气候平均估计。两项都覆盖陆地和海洋。陆地高程取 ETOPO 2022，剖面在海洋处留空。2° 网格适合观察大尺度差异。</p>
      <SourceLink href={ncepLink}>NOAA PSL 再分析</SourceLink>
      <SourceLink href="https://www.ncei.noaa.gov/products/etopo-global-relief-model">NOAA ETOPO 2022</SourceLink>
    </footer>
  </>;
}

export default function Topics({ topic }: { topic: Topic }) {
  const [data, setData] = useState<Float32Array | PlateFrame[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let current = true;
    void loadTopic(topic).then(result => { if (current) setData(result); }, () => { if (current) setError(true); });
    return () => { current = false; };
  }, [topic, retry]);
  const { summary, period } = details[topic];
  return <>
    <TopicHeader topic={topic} period={period} />
    <main className="shell topic-page">
      <p className="topic-intro">{summary}</p>
      {error && <div className="panel topic-status" role="alert">专题数据加载失败。
        <button type="button" className="ghost-button" onClick={() => { setError(false); setRetry(retry + 1); }}>重试</button>
      </div>}
      {!data && !error && <div className="panel topic-status" role="status">正在加载专题数据…</div>}
      {data instanceof Float32Array && topic === 'ocean' && <Ocean data={data} />}
      {data instanceof Float32Array && topic === 'atmosphere' && <Atmosphere data={data} />}
      {data instanceof Float32Array && topic === 'climate' && <Climate data={data} />}
      {Array.isArray(data) && topic === 'mountains' && <Mountains frames={data} />}
    </main>
  </>;
}
