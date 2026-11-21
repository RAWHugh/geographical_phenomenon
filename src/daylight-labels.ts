import { minuteMs } from './local-time';

export const daylightStateLabels = {
  mixed: '昼夜交替',
  'polar-day': '极昼',
  'polar-night': '极夜',
  'all-day': '全天有日照',
  'all-night': '全天无日照',
};

export function durationLabel(duration: number, fullDay: number) {
  if (duration > 0 && duration < minuteMs) return '不足 1 分钟';
  const minutes = duration < fullDay && fullDay - duration < minuteMs
    ? Math.floor(duration / minuteMs)
    : Math.round(duration / minuteMs);
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? (hours ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分钟`) : `${hours} 小时`;
}
