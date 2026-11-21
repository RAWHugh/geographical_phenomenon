import { daylightStateLabels, durationLabel } from './daylight-labels';
import { clockLabel, localAt } from './local-time';
import type { DaylightSummary } from './daylight';

export function DaylightPanel({ data, zone, time }: { data: DaylightSummary | null; zone: string; time: number }) {
  if (!data) return null;
  const { start, end, duration, periods, crossings, regime } = data;
  const width = (length: number) => `${100 * length / (end - start)}%`;
  const startLabel = clockLabel(start, zone);
  const endLabel = `次日 ${clockLabel(end, zone)}`;
  const hasOffsetChange = localAt(start, zone).offset !== localAt(end - 1, zone).offset;
  const events = (['rise', 'set'] as const).map(kind => ({
    caption: kind === 'rise' ? '日出' : '日落',
    times: crossings.filter(crossing => crossing.kind === kind).map(crossing => {
      const clock = clockLabel(crossing.time, zone);
      return hasOffsetChange ? `${clock} (UTC${localAt(crossing.time, zone).offset})` : clock;
    }),
  }));
  const total = durationLabel(duration, end - start);
  const noCrossing = regime === 'polar-day' || regime === 'all-day' ? '太阳整日位于地平线上方' : '太阳整日位于地平线下方';

  return <section className="daylight-panel" aria-labelledby="daylight-title">
    <div className="daylight-heading">
      <h2 id="daylight-title">当日昼长</h2>
      <strong data-testid="daylight-duration">{total}</strong>
      <span className={`daylight-state ${regime}`} data-testid="daylight-state">{daylightStateLabels[regime]}</span>
      <a className="year-chart-link" href="#annual-daylight">全年曲线</a>
    </div>
    <div className="daylight-band" role="img" aria-label={`当地时间 ${startLabel} 至${endLabel}的昼夜分布，青色为白昼，橙色刻线为当前时刻。昼长 ${total}，${daylightStateLabels[regime]}。`}>
      {periods.map(period => <span key={period.start} className={period.daylight ? 'lit' : undefined}
        style={{ width: width(period.end - period.start) }} />)}
      <i className="daylight-cursor" style={{ left: width(time - start) }} />
    </div>
    <div className="daylight-axis" aria-hidden="true"><span>{startLabel}</span><span>{endLabel}</span></div>
    {regime === 'mixed' ? <dl className="daylight-events" title="太阳中心穿过 0° 几何地平线的当地时间">
      {events.map(event => <div key={event.caption}><dt>几何{event.caption}</dt><dd>{event.times.join('、') || '当天无'}</dd></div>)}
    </dl> : <p className="daylight-note">{noCrossing}</p>}
  </section>;
}
