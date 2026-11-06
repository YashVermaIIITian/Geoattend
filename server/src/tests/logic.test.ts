import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineM, evaluateFix } from '../services/geo.service.js';
import { detectFlags } from '../services/anomaly.service.js';
import { computeStatus } from '../services/attendance.service.js';

const C = { lat: 22.0, lng: 73.0 };
const LIM = { maxAccuracyM: 50, toleranceCapM: 20 };
const north = (m: number, acc = 5) => ({ lat: C.lat + m / 111_194.9, lng: C.lng, accuracyM: acc });

test('haversine: one degree of latitude is about 111.19 km', () => {
  assert.ok(Math.abs(haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_194.9) < 5);
});
test('geofence: inside, edge tolerance, outside', () => {
  const r = (m: number) => evaluateFix(north(m), C, 30, LIM);
  assert.equal((r(10) as any).inside, true);
  assert.equal((r(34) as any).inside, true);   // 30 m radius + 5 m accuracy tolerance
  assert.equal((r(36) as any).inside, false);
});
test('geofence: tolerance is capped', () => {
  const r = evaluateFix(north(60, 45), C, 30, LIM); // 45 m accuracy, but cap is 20 m -> limit 50 m
  assert.equal((r as any).inside, false);
});
test('geofence: poor accuracy and bad coordinates are rejected, not guessed', () => {
  assert.deepEqual(evaluateFix(north(5, 80), C, 30, LIM), { accepted: false, reason: 'POOR_ACCURACY' });
  assert.deepEqual(evaluateFix({ lat: NaN, lng: 0, accuracyM: 5 }, C, 30, LIM), { accepted: false, reason: 'INVALID_COORDS' });
  assert.deepEqual(evaluateFix({ lat: 95, lng: 0, accuracyM: 5 }, C, 30, LIM), { accepted: false, reason: 'INVALID_COORDS' });
});
test('anomaly: impossible speed flagged, normal jitter is not', () => {
  const t = 1_000_000;
  const prev = { ...north(5), at: t };
  assert.deepEqual(detectFlags({ ...north(1000), at: t + 10_000 }, [prev]), ['IMPOSSIBLE_SPEED']);
  assert.deepEqual(detectFlags({ ...north(12), at: t + 10_000 }, [prev]), []);
});
test('anomaly: frozen coordinates flagged after 5 identical fixes', () => {
  const s = (at: number) => ({ lat: 22.1, lng: 73.1, accuracyM: 5, at });
  assert.deepEqual(detectFlags(s(5), [s(4), s(3), s(2), s(1)]), ['REPEATED_COORDS']);
  assert.deepEqual(detectFlags(s(4), [s(3), s(2), s(1)]), []);
});

const T0 = Date.parse('2026-11-02T09:00:00Z'), MIN = 60_000;
const base = { startsAt: T0, endsAt: T0 + 60 * MIN, intervalMin: 5, minPresencePct: 75, graceMissed: 1, lateAfterMin: 10, flagged: false };
const ins = (n: number, from = 0) => Array.from({ length: n }, (_, k) => ({ at: T0 + (from + k * 5) * MIN, inside: true }));
test('status: present, grace allowance, absent, late, pending, flagged', () => {
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(12) }).status, 'Present');
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(9) }).status, 'Present');  // 9/11 = 81.8%
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(6) }).status, 'Absent');   // 6/11 = 54.5%
  assert.equal(computeStatus({ ...base, ended: true, checkIns: [] }).status, 'Absent');
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(10, 15) }).status, 'Late');
  assert.equal(computeStatus({ ...base, ended: false, checkIns: ins(3) }).status, 'Pending');
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(12), flagged: true }).status, 'Flagged');
  assert.equal(computeStatus({ ...base, ended: true, checkIns: ins(12) }).presencePct, 100);
});
