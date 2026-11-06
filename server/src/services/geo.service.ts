export interface LatLng { lat: number; lng: number }
export interface Fix extends LatLng { accuracyM: number }
export interface GeoLimits { maxAccuracyM: number; toleranceCapM: number }

export type FixResult =
  | { accepted: false; reason: 'INVALID_COORDS' | 'POOR_ACCURACY' }
  | { accepted: true; distanceM: number; inside: boolean };

const R = 6_371_000; // mean Earth radius, metres
const rad = Math.PI / 180;

export function haversineM(a: LatLng, b: LatLng): number {
  const dPhi = (b.lat - a.lat) * rad;
  const dLam = (b.lng - a.lng) * rad;
  const h = Math.sin(dPhi / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLam / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Accuracy gate + boundary test. Tolerance = reported accuracy, capped, so a good fix
 *  at the edge isn't rejected but a poor fix can't widen the fence much. */
export function evaluateFix(fix: Fix, center: LatLng, radiusM: number, lim: GeoLimits): FixResult {
  const ok = Number.isFinite(fix.lat) && Number.isFinite(fix.lng) && Number.isFinite(fix.accuracyM)
    && Math.abs(fix.lat) <= 90 && Math.abs(fix.lng) <= 180 && fix.accuracyM >= 0;
  if (!ok) return { accepted: false, reason: 'INVALID_COORDS' };
  if (fix.accuracyM > lim.maxAccuracyM) return { accepted: false, reason: 'POOR_ACCURACY' };
  const distanceM = haversineM(fix, center);
  const tolerance = Math.min(fix.accuracyM, lim.toleranceCapM);
  return { accepted: true, distanceM, inside: distanceM <= radiusM + tolerance };
}
