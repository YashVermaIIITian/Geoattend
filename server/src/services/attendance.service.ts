export type Status = 'Present' | 'Absent' | 'Late' | 'Pending' | 'Flagged';

export interface StatusInput {
  ended: boolean;
  startsAt: number; endsAt: number;         // epoch ms
  intervalMin: number; minPresencePct: number;
  graceMissed: number;                      // check-ins a student may miss (GPS dropouts)
  lateAfterMin: number;
  checkIns: { at: number; inside: boolean }[];
  flagged: boolean;
}

export function computeStatus(i: StatusInput): { status: Status; presencePct: number } {
  const expected = Math.max(1, Math.floor((i.endsAt - i.startsAt) / (i.intervalMin * 60_000)));
  const effective = Math.max(1, expected - i.graceMissed);
  const inside = i.checkIns.filter(c => c.inside);
  const presencePct = Math.min(100, Math.round((inside.length / effective) * 1000) / 10);

  if (i.flagged) return { status: 'Flagged', presencePct };
  if (!i.ended) return { status: 'Pending', presencePct };
  if (inside.length === 0 || presencePct < i.minPresencePct) return { status: 'Absent', presencePct };
  const first = Math.min(...inside.map(c => c.at));
  return { status: first > i.startsAt + i.lateAfterMin * 60_000 ? 'Late' : 'Present', presencePct };
}
