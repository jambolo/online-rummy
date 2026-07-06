import { describe, expect, it } from 'vitest';
import type { SoundId } from './soundMap';
import { ACTION_HOLD_MS, createHoldGate, cueFamily } from './holdPolicy';
import type { CueFamily } from './holdPolicy';

// Manual fake scheduler standing in for setTimeout/clearTimeout so tests drive
// time by hand instead of touching real timers.
type FakeEntry = { fn: () => void; ms: number; cancelled: boolean };

function makeScheduler(): { schedule: (fn: () => void, ms: number) => () => void; entries: FakeEntry[] } {
  const entries: FakeEntry[] = [];
  const schedule = (fn: () => void, ms: number): (() => void) => {
    const entry: FakeEntry = { fn, ms, cancelled: false };
    entries.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  return { schedule, entries };
}

function fire(entry: FakeEntry | undefined): void {
  if (entry === undefined) throw new Error('expected a scheduled entry');
  if (!entry.cancelled) entry.fn();
}

describe('ACTION_HOLD_MS', () => {
  it('is 80', () => {
    expect(ACTION_HOLD_MS).toBe(80);
  });
});

describe('cueFamily', () => {
  const cases: Array<{ id: SoundId; expected: CueFamily }> = [
    { id: 'draw-stock', expected: 'action' },
    { id: 'draw-discard', expected: 'action' },
    { id: 'pile-dive', expected: 'action' },
    { id: 'meld', expected: 'action' },
    { id: 'layoff', expected: 'action' },
    { id: 'discard', expected: 'action' },
    { id: 'hand-over', expected: 'outcome' },
    { id: 'go-out', expected: 'outcome' },
    { id: 'gin', expected: 'outcome' },
    { id: 'undercut', expected: 'outcome' },
    { id: 'game-over', expected: 'outcome' },
    { id: 'hand-cancelled', expected: 'outcome' },
    { id: 'knock', expected: 'other' },
    { id: 'deal', expected: 'other' },
    { id: 'your-turn', expected: 'other' },
    { id: 'error', expected: 'other' },
    { id: 'chat', expected: 'other' },
    { id: 'player-joined', expected: 'other' },
    { id: 'disconnect', expected: 'other' },
    { id: 'reconnect', expected: 'other' },
    { id: 'forfeit', expected: 'other' },
  ];

  it.each(cases)('$id -> $expected', ({ id, expected }) => {
    expect(cueFamily(id)).toBe(expected);
  });

  it('covers all 21 SoundIds', () => {
    expect(cases).toHaveLength(21);
  });
});

describe('createHoldGate', () => {
  it('plays an other-family cue synchronously', () => {
    const { schedule } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('knock', (id) => played.push(id));

    expect(played).toEqual(['knock']);
  });

  it('does not play an action cue before its timer fires', () => {
    const { schedule, entries } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('discard', (id) => played.push(id));

    expect(played).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ms).toBe(ACTION_HOLD_MS);
  });

  it('plays an action cue once its timer fires', () => {
    const { schedule, entries } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('discard', (id) => played.push(id));
    fire(entries[0]);

    expect(played).toEqual(['discard']);
  });

  it('plays an outcome cue synchronously', () => {
    const { schedule } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('hand-over', (id) => played.push(id));

    expect(played).toEqual(['hand-over']);
  });

  it('outcome cancels a pending action; the stale timer firing later is a no-op', () => {
    const { schedule, entries } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('discard', (id) => played.push(id));
    gate.submit('hand-over', (id) => played.push(id));
    expect(played).toEqual(['hand-over']);

    fire(entries[0]);
    expect(played).toEqual(['hand-over']);
  });

  it('outcome cancels multiple pending actions at once', () => {
    const { schedule, entries } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('meld', (id) => played.push(id));
    gate.submit('layoff', (id) => played.push(id));
    gate.submit('gin', (id) => played.push(id));
    expect(played).toEqual(['gin']);

    for (const entry of entries) fire(entry);
    expect(played).toEqual(['gin']);
  });

  it('an action submitted after an outcome starts a fresh moment and still plays', () => {
    const { schedule, entries } = makeScheduler();
    const gate = createHoldGate(schedule);
    const played: SoundId[] = [];

    gate.submit('gin', (id) => played.push(id));
    gate.submit('draw-stock', (id) => played.push(id));
    expect(played).toEqual(['gin']);

    expect(entries[0]?.cancelled).toBe(false);
    fire(entries[0]);
    expect(played).toEqual(['gin', 'draw-stock']);
  });
});
