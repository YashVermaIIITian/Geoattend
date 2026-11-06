import { haversineM } from './geo.service.js';

export interface Sample { lat: number; lng: number; accuracyM: number; at: number } // at = epoch ms
export type Flag = 'IMPOSSIBLE_SPEED' | 'REPEATED_COORDS';

export const MAX_PLAUSIBLE_SPEED_MS = 15; // m/s; generous for a campus (running ~6, cycling ~10)
export const REPEAT_THRESHOLD = 5;        // identical fixes in a row

/** Suspicious-activity heuristics only. These raise flags for lecturer review;
 *  they cannot prove or prevent GPS spoofing. `history` is newest-first. */
export function detectFlags(cur: Sample, history: Sample[]): Flag[] {
  const flags: Flag[] = [];
  const prev = history[0];
  if (prev) {
    const dt = Math.max(1, (cur.at - prev.at) / 1000);
    // subtract both fixes' error radii so normal jitter never counts as movement
    const moved = Math.max(0, haversineM(prev, cur) - prev.accuracyM - cur.accuracyM);
    if (moved / dt > MAX_PLAUSIBLE_SPEED_MS) flags.push('IMPOSSIBLE_SPEED');
  }
  const recent = [cur, ...history].slice(0, REPEAT_THRESHOLD);
  if (recent.length === REPEAT_THRESHOLD && recent.every(s => s.lat === cur.lat && s.lng === cur.lng)) {
    flags.push('REPEATED_COORDS'); // real GPS jitters; a frozen coordinate is suspicious
  }
  return flags;
}
