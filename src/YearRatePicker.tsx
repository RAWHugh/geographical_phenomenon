import { yearRates } from './year-playback';
import type { YearRate } from './year-playback';

export function YearRatePicker({ value, onChange, label }: {
  value: YearRate;
  onChange: (rate: YearRate) => void;
  label: string;
}) {
  return <select className="year-rate-picker" aria-label={label} value={value}
    onChange={event => {
      const rate = yearRates.find(option => option === Number(event.target.value));
      if (rate) onChange(rate);
    }}>
    {yearRates.map(rate => <option value={rate} key={rate}>{rate} 天/秒</option>)}
  </select>;
}
