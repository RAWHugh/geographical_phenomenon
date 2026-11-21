export const polarPalette = { day: '#f4cc68', night: '#cca1fa' };

export type PolarCaps = {
  latitude: number;
  dayHemisphere: 1 | -1;
};

export function polarCapsAt(declination: number): PolarCaps | null {
  const reach = Math.abs(declination);
  // A cap narrower than the latitude readout's rounding precision is unresolved.
  if (reach < .005) return null;
  return { latitude: 90 - reach, dayHemisphere: declination > 0 ? 1 : -1 };
}
