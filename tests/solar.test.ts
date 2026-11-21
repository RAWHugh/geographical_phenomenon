import { describe, expect, it } from 'vitest';
import { altitudeAt, dot, solarAltitude, solarFrame, solarTerms, surfaceVector, terminatorArc } from '../src/solar';
import { annualHeights, dailyHeights, dayBounds, localAt, places, termsForLocalYear, wallTimeOptions, zoneAt } from '../src/local-time';
import { orbitAt, orbitPath } from '../src/orbit';
import { daylightForLocation, daylightForSamples } from '../src/daylight';
import { polarCapsAt } from '../src/polar';
import { annualDaylight } from '../src/annual-daylight';
import { jumpToYearDay, shiftYearDate, yearCursor } from '../src/year-playback';

describe('solar geometry', () => {
  it('agrees with NASA JPL Horizons airless elevations at sea level', () => {
    // Target 10, observer coord@399 with QUANTITIES=4 and APPARENT=AIRLESS.
    const samples = [
      [places[0], '2026-06-21', [73.184954, -3.032313, -7.997227]],
      [places[3], '2026-12-21', [60.407949, -26.685421, 14.097657]],
      [places[2], '2026-12-21', [-25.540958, -4.134024, -37.967374]],
    ] as const;
    for (const [location, date, expected] of samples) {
      for (const [index, hour] of ['04', '12', '20'].entries()) {
        const time = Date.parse(`${date}T${hour}:00:00Z`);
        expect(Math.abs(solarAltitude(time, location) - expected[index])).toBeLessThan(.1);
      }
    }
  });

  it('shares one solar direction between the day mask, altitude and both terminator arcs', () => {
    for (const longitude of [0, 90, 180, 270]) {
      const time = solarTerms(2026).find(term => term.longitude === longitude)!.time;
      const frame = solarFrame(time);
      expect(altitudeAt(frame.subsolar, frame.direction)).toBeCloseTo(90, 4);
      const antipode = { lat: -frame.subsolar.lat, lon: frame.subsolar.lon + 180 };
      expect(altitudeAt(antipode, frame.direction)).toBeCloseTo(-90, 4);
      const delta = solarFrame(time + 60_000).direction;
      for (const dawn of [true, false]) {
        const arc = terminatorArc(frame, dawn);
        for (const point of arc) expect(altitudeAt(point, frame.direction)).toBeCloseTo(0, 8);
        expect(dot(surfaceVector(arc[45]), delta) > 0).toBe(dawn);
      }
    }
  });
});

describe('solar terms', () => {
  it('matches all 12 major solar terms printed on p. 39 of the HKO Almanac 2026', () => {
    const published = [
      '01-20T09:45', '02-18T23:52', '03-20T22:46', '04-20T09:39', '05-21T08:37', '06-21T16:25',
      '07-23T03:13', '08-23T10:19', '09-23T08:05', '10-23T17:38', '11-22T15:23', '12-22T04:50',
    ];
    const terms = solarTerms(2026).filter(term => term.longitude % 30 === 0);
    terms.forEach((term, i) => expect(Math.abs(term.time - Date.parse(`2026-${published[i]}:00+08:00`))).toBeLessThan(120_000));
    const four = solarTerms(2026).filter(term => term.longitude % 90 === 0);
    const latitudes = [0, 23.44, 0, -23.44];
    four.forEach((term, i) => expect(Math.abs(solarFrame(term.time).subsolar.lat - latitudes[i])).toBeLessThan(.02));
  });

  it('returns 24 chronological terms per year including selectable year boundaries', () => {
    for (let year = 1999; year <= 2051; year++) {
      const terms = solarTerms(year);
      expect(terms.length).toBe(24);
      expect(terms.every((term, index) => index === 0 || term.time > terms[index - 1].time)).toBe(true);
    }
    const local = termsForLocalYear(2026, 'Pacific/Kiritimati');
    expect(local.preceding.name).toBe('冬至');
    expect(local.following.name).toBe('小寒');
    expect(local.terms).toHaveLength(24);
  });
});

describe('Earth orbit', () => {
  it('matches solar declination and keeps the north axis in the same direction through the seasons', () => {
    const four = solarTerms(2026).filter(term => term.longitude % 90 === 0);
    const positions = four.map(term => orbitAt(term.time));
    positions.forEach((state, index) => {
      const targetLongitude = (four[index].longitude + 180) % 360;
      const error = Math.abs(state.longitude - targetLongitude);
      expect(Math.min(error, 360 - error)).toBeLessThan(.001);
      expect(state.tilt).toBeCloseTo(23.44, 1);
      expect(dot(state.north, positions[0].north)).toBeGreaterThan(.99999);
      expect(state.northSunAngle).toBeCloseTo(solarFrame(four[index].time).subsolar.lat, 2);
    });
    expect(positions[1].northSunAngle).toBeGreaterThan(23);
    expect(positions[3].northSunAngle).toBeLessThan(-23);
    expect(positions[1].distance).toBeGreaterThan(positions[3].distance);
    const path = orbitPath(2026);
    expect(path.every(point => point[2] === 0 && Math.hypot(...point) > .98 && Math.hypot(...point) < 1.02)).toBe(true);
  });
});

describe('global polar coverage', () => {
  it('shrinks toward the equinox and reverses hemispheres at the solstices', () => {
    const terms = solarTerms(2026);
    const capsFor = (name: string) => polarCapsAt(solarFrame(terms.find(term => term.name === name)!.time).subsolar.lat);
    expect(capsFor('春分')).toBeNull();
    expect(capsFor('秋分')).toBeNull();
    expect(capsFor('夏至')?.dayHemisphere).toBe(1);
    expect(capsFor('冬至')?.dayHemisphere).toBe(-1);
    expect(capsFor('夏至')?.latitude).toBeCloseTo(66.56, 2);
    expect(capsFor('冬至')?.latitude).toBeCloseTo(66.56, 2);
    expect(capsFor('清明')?.latitude).toBeGreaterThan(80);
  });

  it('places the latitude limits where the lower and upper transits touch the horizon', () => {
    for (const declination of [5, 23.44, -5, -23.44]) {
      const caps = polarCapsAt(declination)!;
      const direction = surfaceVector({ lat: declination, lon: 0 });
      const day = caps.latitude * caps.dayHemisphere;
      expect(altitudeAt({ lat: day, lon: 180 }, direction)).toBeCloseTo(0, 8);
      expect(altitudeAt({ lat: -day, lon: 0 }, direction)).toBeCloseTo(0, 8);
    }
  });
});

describe('local civil time and transit', () => {
  it('keeps one UTC instant across the International Date Line', () => {
    const time = Date.parse('2026-01-01T10:30:00Z');
    expect(localAt(time, 'Etc/GMT+12').toPlainDate().toString()).toBe('2025-12-31');
    expect(localAt(time, 'Pacific/Kiritimati').toPlainDate().toString()).toBe('2026-01-02');
    expect(zoneAt(places[0])).toBe('Asia/Shanghai');
  });

  it('supports daylight saving gaps and repeated wall times on 23/25-hour days', () => {
    const ny = 'America/New_York';
    expect(wallTimeOptions('2026-03-08T02:30', ny)).toEqual([]);
    expect(wallTimeOptions('2026-11-01T01:30', ny).map(option => option.offset)).toEqual(['-04:00', '-05:00']);
    expect(dailyHeights('2026-03-08', ny, places[4])).toHaveLength(23 * 12 + 1);
    expect(dailyHeights('2026-11-01', ny, places[4])).toHaveLength(25 * 12 + 1);
  });

  it('uses the true transit, includes leap day, and skips dates absent from the local calendar', () => {
    const annual = annualHeights(2024, places[0].zone, places[0]);
    expect(annual).toHaveLength(366);
    expect(annual[59].date).toBe('2024-02-29');
    expect(annual[59].sample).not.toBeNull();
    const june = annualHeights(2026, places[0].zone, places[0]).find(day => day.date === '2026-06-21')!.sample!;
    expect(Math.abs(june.time - Date.parse('2026-06-21T04:16:07Z'))).toBeLessThan(1_000);
    const samoa = dayBounds('2011-12-30', 'Pacific/Apia');
    expect(samoa.start).toBe(samoa.end);
    const polar = annualHeights(2026, 'UTC', { lon: 0, lat: 90 });
    expect(polar[171].sample?.height).toBeCloseTo(23.44, 1);
  });
});

describe('daylight', () => {
  it('finds geometric sunrise and sunset from the same solar model as the map', () => {
    const point = places[0];
    const data = daylightForLocation(dailyHeights('2026-06-21', point.zone, point), point)!;
    expect(data.regime).toBe('mixed');
    expect(data.crossings.map(event => event.kind)).toEqual(['rise', 'set']);
    for (const event of data.crossings) expect(Math.abs(solarAltitude(event.time, point))).toBeLessThan(.001);
    expect(data.duration).toBe(data.crossings[1].time - data.crossings[0].time);
    expect(data.duration / 3_600_000).toBeCloseTo(14.84, 1);
  });

  it('distinguishes polar day and polar night in both hemispheres', () => {
    for (const [point, june, december] of [
      [places[2], 'polar-day', 'polar-night'],
      [places.find(place => place.name === '南极点')!, 'polar-night', 'polar-day'],
    ] as const) {
      for (const [date, expected] of [['2026-06-21', june], ['2026-12-21', december]] as const) {
        const data = daylightForLocation(dailyHeights(date, point.zone, point), point)!;
        expect(data.regime).toBe(expected);
        expect(data.duration).toBe(expected === 'polar-day' ? 86_400_000 : 0);
        expect(data.crossings).toEqual([]);
      }
    }
  });

  it('keeps daylight segments inside the 23- and 25-hour civil days', () => {
    const ny = places[4];
    for (const [date, hours] of [['2026-03-08', 23], ['2026-11-01', 25]] as const) {
      const data = daylightForLocation(dailyHeights(date, ny.zone, ny), ny)!;
      const hoursMs = hours * 3_600_000;
      expect(data.end - data.start).toBe(hoursMs);
      expect(data.periods.reduce((sum, period) => sum + period.end - period.start, 0)).toBe(hoursMs);
      expect(data.crossings.map(event => event.kind)).toEqual(['rise', 'set']);
    }
  });

  it('detects a night shorter than the sampling interval near a grazing crossing', () => {
    const midnight = 12 * 3_600_000 + 120_000;
    const height = (time: number) => ((time - midnight) / 60_000) ** 2 - 1;
    const samples = Array.from({ length: 289 }, (_, i) => ({ time: i * 300_000, height: height(i * 300_000) }));
    expect(samples.every(sample => sample.height > 0)).toBe(true);
    const data = daylightForSamples(samples, height)!;
    expect(data.regime).toBe('mixed');
    expect(data.crossings.map(event => event.kind)).toEqual(['set', 'rise']);
    expect(Math.abs(data.end - data.start - data.duration - 120_000)).toBeLessThan(250);
  });

  it('handles daylight across midnight and continuous light on a shortened civil day', () => {
    const duration = 23 * 3_600_000;
    const height = (time: number) => 1 + time / 300_000;
    const samples = Array.from({ length: 277 }, (_, i) => ({ time: i * 300_000, height: height(i * 300_000) }));
    const shortened = daylightForSamples(samples, height)!;
    expect(shortened.regime).toBe('all-day');
    expect(shortened.duration).toBe(duration);

    const sg = places[1];
    const shifted = daylightForLocation(dailyHeights('2026-06-21', 'Etc/GMT+8', sg), sg)!;
    expect(shifted.periods.map(period => period.daylight)).toEqual([true, false, true]);
    expect(shifted.crossings.map(event => event.kind)).toEqual(['set', 'rise']);
  });
});

describe('annual daylight', () => {
  it('includes leap day and agrees with the single-day panel', () => {
    const point = places[0];
    const data = annualDaylight({ year: 2024, zone: point.zone, point });
    expect(data.days).toHaveLength(366);
    expect(data.days[59].date).toBe('2024-02-29');
    const daily = daylightForLocation(dailyHeights('2024-06-21', point.zone, point), point)!;
    expect(data.days.find(day => day.date === '2024-06-21')?.sample?.duration).toBe(daily.duration);
    expect(data.periods).toHaveLength(0);
  });

  it('shows real cross-year polar dates while clipping the shaded ranges to the chart', () => {
    const point = places.find(place => place.name === '南极点')!;
    const data = annualDaylight({ year: 2026, zone: point.zone, point });
    expect(data.periods.map(period => period.regime)).toEqual(['polar-day', 'polar-night', 'polar-day']);
    expect(data.periods[0].first).toBe(0);
    expect(data.periods[0].starts).toMatch(/^2025-09-/);
    expect(data.periods.at(-1)?.last).toBe(364);
    expect(data.periods.at(-1)?.ends).toMatch(/^2027-03-/);
    for (const period of data.periods) {
      expect(data.days.slice(period.first, period.last + 1).every(day => day.sample?.regime === period.regime)).toBe(true);
    }
  });

  it('preserves the gap for a date skipped by the civil calendar', () => {
    const data = annualDaylight({ year: 2011, zone: 'Pacific/Apia', point: { lat: -13.8, lon: -171.8 } });
    expect(data.days).toHaveLength(365);
    expect(data.days.at(-2)).toEqual({ date: '2011-12-30', sample: null });
    expect(data.days.at(-1)?.sample).not.toBeNull();
  });
});

describe('annual playback calendar', () => {
  it('keeps the local clock through leap day and stays within the chosen year', () => {
    const original = yearCursor(localAt(Date.parse('2024-02-28T04:16:23Z'), 'Asia/Shanghai'));
    const leapDay = shiftYearDate(original, 1)!;
    expect(leapDay.date.toString()).toBe('2024-02-29');
    expect(localAt(leapDay.time, original.zone).toPlainTime().toString()).toBe('12:16:23');
    expect(shiftYearDate(leapDay, 1)?.date.toString()).toBe('2024-03-01');
    const last = jumpToYearDay(original, 365)!;
    expect(last.date.toString()).toBe('2024-12-31');
    expect(shiftYearDate(last, 1)).toBeNull();
    expect(jumpToYearDay(last, 0)?.date.toString()).toBe('2024-01-01');
  });

  it('handles daylight saving while retaining the original clock for later dates', () => {
    const zone = 'America/New_York';
    const beforeGap = yearCursor(localAt(Date.parse('2026-03-07T07:30:00Z'), zone));
    const gap = shiftYearDate(beforeGap, 1)!;
    expect(localAt(gap.time, zone).toPlainTime().toString()).toBe('03:30:00');
    expect(localAt(shiftYearDate(gap, 1)!.time, zone).toPlainTime().toString()).toBe('02:30:00');
    const beforeFold = yearCursor(localAt(Date.parse('2026-10-31T05:30:00Z'), zone));
    expect(shiftYearDate(beforeFold, 1)?.time).toBe(Date.parse('2026-11-01T05:30:00Z'));
  });

  it('skips civil dates absent from the local calendar in either direction', () => {
    const zone = 'Pacific/Apia';
    const beforeSkip = yearCursor(localAt(Date.parse('2011-12-29T22:00:00Z'), zone));
    const afterSkip = shiftYearDate(beforeSkip, 1)!;
    expect(beforeSkip.date.toString()).toBe('2011-12-29');
    expect(afterSkip.date.toString()).toBe('2011-12-31');
    expect(localAt(afterSkip.time, zone).toPlainTime().toString()).toBe('12:00:00');
    expect(shiftYearDate(afterSkip, -1)?.date.toString()).toBe('2011-12-29');
    expect(jumpToYearDay(beforeSkip, 363)?.date.toString()).toBe('2011-12-31');
  });

  it('keeps an existing date when a clock gap extends across midnight', () => {
    const zone = 'America/Nuuk';
    const previous = yearCursor(localAt(Date.parse('2024-03-30T01:30:00Z'), zone));
    const duringGap = shiftYearDate(previous, 1)!;
    expect(duringGap.date.toString()).toBe('2024-03-30');
    expect(localAt(duringGap.time, zone).toPlainTime().toString()).toBe('22:30:00');
    expect(localAt(shiftYearDate(duringGap, 1)!.time, zone).toPlainTime().toString()).toBe('23:30:00');
  });
});
