import { useId, useState } from 'react';
import type { ObserverSlot } from './observers';
import { coordinateLabel, places, validZone, zoneAt } from './local-time';
import type { Place } from './local-time';
import { wrapLongitude } from './solar';

const zones = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export function PlacePicker({ place, onChange, slot }: { place: Place; onChange: (place: Place) => void; slot?: ObserverSlot }) {
  const zoneOptions = useId();
  const second = slot === 'B';
  const prefix = second ? 'comparison-' : '';
  const [lat, setLat] = useState(String(place.lat));
  const [lon, setLon] = useState(String(place.lon));
  const [zone, setZone] = useState('');
  const [error, setError] = useState('');
  return <div className={`place-picker${second ? ' comparison-picker' : ''}`} data-guide={second ? undefined : 'place'}>
    <div className="place-name">
      <div>
        <span className="heading-overline"><i className={second ? 'compare-dot' : 'site-dot'} aria-hidden="true" />
          {second ? 'B 对比地点' : slot ? 'A 主观测点' : '观测点'}
        </span>
        <h2 data-testid={`${prefix}place-name`}>{place.name}</h2>
      </div>
      <div className="coordinates-readout">
        <span data-testid={`${prefix}observer-coordinates`}>{coordinateLabel(place)}</span>
        <small title={place.zone} data-testid={`${prefix}iana-zone`}>{place.zone}</small>
      </div>
    </div>
    <label className="preset-row">
      <span>地点预设</span>
      <select aria-label={second ? '对比地点预设' : '地点预设'} value={places.some(p => p.name === place.name) ? place.name : ''}
        onChange={event => {
          const preset = places.find(p => p.name === event.target.value);
          if (preset) onChange(preset);
        }}>
        <option value="" disabled>自选地点</option>
        {places.map(preset => <option key={preset.name}>{preset.name}</option>)}
      </select>
    </label>
    <details className="point-details">
      <summary>{second ? '对比点经纬度与时区' : '经纬度与时区'}</summary>
      <form className="point-form" onSubmit={event => {
        event.preventDefault();
        const point = { lat: Number(lat), lon: wrapLongitude(Number(lon)) };
        const requestedZone = zone.trim();
        if (requestedZone && !validZone(requestedZone)) {
          setError('请输入有效的 IANA 时区，例如 Asia/Shanghai。');
          return;
        }
        const name = point.lat === place.lat && Math.abs(point.lon - place.lon) < 1e-9 ? place.name : '自定义坐标';
        onChange({ ...point, name, zone: requestedZone || zoneAt(point) });
        setError('');
      }}>
        <label>纬度<input type="number" aria-label={second ? '对比点纬度' : '纬度'} min={-90} max={90} step="any" value={lat} required onChange={event => setLat(event.target.value)} /></label>
        <label>经度<input type="number" aria-label={second ? '对比点经度' : '经度'} min={-180} max={180} step="any" value={lon} required onChange={event => setLon(event.target.value)} /></label>
        <label className="zone-input">IANA 时区<input aria-label={second ? '对比点 IANA 时区' : 'IANA 时区'} placeholder={place.zone} list={zoneOptions} value={zone} onChange={event => setZone(event.target.value)} /></label>
        <datalist id={zoneOptions}>{zones.map(name => <option key={name} value={name} />)}</datalist>
        <small>留空时按坐标识别，可在时区边界附近手动修正。</small>
        <button className="small-button" type="submit">{second ? '应用对比地点' : '应用观测点'}</button>
        {error && <p className="point-error" role="alert">{error}</p>}
      </form>
    </details>
  </div>;
}
