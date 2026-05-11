import {
  computeNextAlarmAt,
  computeTier,
  effectiveDeadline,
  isWithinWindow,
  nextWindowOpenAt,
  notificationIdFor,
  startOfDay,
} from './scheduling-math';
import { Task, UserPrefs } from '../models/task';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const PREFS: UserPrefs = {
  operatingWindowStartHour: 9,
  operatingWindowEndHour: 21,
  oemRiskTier: 'none',
};

function midnight(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

function at(y: number, m: number, d: number, hour: number, minute = 0, second = 0): number {
  return new Date(y, m - 1, d, hour, minute, second, 0).getTime();
}

function makeTask(deadlineMidnight: number, overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    name: 'test',
    createdAt: 0,
    deadline: deadlineMidnight,
    remindMe: true,
    status: 'active',
    sequenceNumber: 0,
    ...overrides,
  };
}

describe('scheduling-math', () => {
  describe('startOfDay', () => {
    it('returns local midnight of the same calendar day', () => {
      const ts = at(2026, 5, 12, 14, 37);
      expect(startOfDay(ts)).toBe(midnight(2026, 5, 12));
    });

    it('is idempotent for timestamps already at midnight', () => {
      const m = midnight(2026, 5, 12);
      expect(startOfDay(m)).toBe(m);
    });
  });

  describe('effectiveDeadline', () => {
    it('promotes a midnight-day deadline to operatingWindowEndHour minus the 1h safety buffer', () => {
      const task = makeTask(midnight(2026, 5, 12));
      expect(effectiveDeadline(task, PREFS)).toBe(at(2026, 5, 12, 20));
    });

    it('honours different operatingWindowEndHour values', () => {
      const task = makeTask(midnight(2026, 5, 12));
      const prefs: UserPrefs = { ...PREFS, operatingWindowEndHour: 18 };
      expect(effectiveDeadline(task, prefs)).toBe(at(2026, 5, 12, 17));
    });
  });

  describe('isWithinWindow', () => {
    it('returns true for hours inside the safety-buffered window', () => {
      // Window 09–21, safety buffer makes effective end 20:00, so 09–19 inclusive is "within".
      expect(isWithinWindow(at(2026, 5, 12, 9), PREFS)).toBe(true);
      expect(isWithinWindow(at(2026, 5, 12, 14, 30), PREFS)).toBe(true);
      expect(isWithinWindow(at(2026, 5, 12, 19, 59), PREFS)).toBe(true);
    });

    it('returns false at and past the effective end hour', () => {
      expect(isWithinWindow(at(2026, 5, 12, 20), PREFS)).toBe(false);
      expect(isWithinWindow(at(2026, 5, 12, 21), PREFS)).toBe(false);
    });

    it('returns false before the start hour', () => {
      expect(isWithinWindow(at(2026, 5, 12, 8, 59), PREFS)).toBe(false);
      expect(isWithinWindow(at(2026, 5, 12, 0), PREFS)).toBe(false);
    });
  });

  describe('nextWindowOpenAt', () => {
    it('returns the same timestamp when already inside the window', () => {
      const ts = at(2026, 5, 12, 14);
      expect(nextWindowOpenAt(ts, PREFS)).toBe(ts);
    });

    it('snaps forward to today\'s start hour when called before the window opens', () => {
      const ts = at(2026, 5, 12, 7);
      expect(nextWindowOpenAt(ts, PREFS)).toBe(at(2026, 5, 12, 9));
    });

    it('rolls to tomorrow\'s start hour when called past the window\'s effective end', () => {
      const ts = at(2026, 5, 12, 22);
      expect(nextWindowOpenAt(ts, PREFS)).toBe(at(2026, 5, 13, 9));
    });
  });

  describe('computeTier', () => {
    const today = midnight(2026, 5, 12);

    it('returns expired once now is past effective deadline (window end minus safety buffer)', () => {
      const task = makeTask(today);
      const past = at(2026, 5, 12, 20, 1);
      expect(computeTier(past, task, PREFS)).toBe('expired');
    });

    it('returns urgent when deadline day == today and we are pre-cutoff', () => {
      const task = makeTask(today);
      const now = at(2026, 5, 12, 10);
      expect(computeTier(now, task, PREFS)).toBe('urgent');
    });

    it('returns urgent when deadline day is in the past but cutoff not yet reached', () => {
      // task was due yesterday — odd, but the spec says "deadline day is today or earlier",
      // and now < effective deadline. (Shouldn't normally arise because yesterday's cutoff
      // has long passed, but guards the comparison logic.)
      const task = makeTask(midnight(2026, 5, 11));
      const now = at(2026, 5, 11, 12); // same calendar day as the deadline, before cutoff
      expect(computeTier(now, task, PREFS)).toBe('urgent');
    });

    it('returns near for 1–7 days ahead', () => {
      const now = at(2026, 5, 12, 10);
      for (let d = 1; d <= 7; d++) {
        const task = makeTask(midnight(2026, 5, 12 + d));
        expect(computeTier(now, task, PREFS)).toBe('near');
      }
    });

    it('returns distant for >7 days ahead', () => {
      const now = at(2026, 5, 12, 10);
      const task = makeTask(midnight(2026, 5, 20)); // 8 days out
      expect(computeTier(now, task, PREFS)).toBe('distant');
    });
  });

  describe('computeNextAlarmAt', () => {
    it('returns null after the effective deadline has passed', () => {
      const task = makeTask(midnight(2026, 5, 12));
      // Effective deadline is 20:00 (9-21 window minus 1h safety buffer).
      expect(computeNextAlarmAt(task, PREFS, at(2026, 5, 12, 20, 30))).toBeNull();
    });

    it('clamps the final ping to the effective deadline when the grid overshoots', () => {
      // Urgent tier at 18:00 in a 9-21 window. Next 3h-grid slot from 19:00
      // (now + 1h buffer) lands at 21:00 — that's past the safety-buffered
      // window end (20:00), so the clamp returns the deadline cutoff.
      const task = makeTask(midnight(2026, 5, 12));
      const now = at(2026, 5, 12, 18);
      const next = computeNextAlarmAt(task, PREFS, now)!;
      expect(next).toBe(at(2026, 5, 12, 20));
    });

    it('distant tier schedules 3 calendar days out at the operating-window start hour', () => {
      const task = makeTask(midnight(2026, 5, 25));
      const now = at(2026, 5, 12, 10, 37); // intentionally an odd minute/second
      const next = computeNextAlarmAt(task, PREFS, now)!;
      expect(next).toBe(at(2026, 5, 15, PREFS.operatingWindowStartHour));
    });

    it('near tier schedules the next morning at the window start', () => {
      const task = makeTask(midnight(2026, 5, 16)); // 4 days out — "near"
      const now = at(2026, 5, 12, 15, 42);
      const next = computeNextAlarmAt(task, PREFS, now)!;
      expect(next).toBe(at(2026, 5, 13, PREFS.operatingWindowStartHour));
    });

    it('urgent tier snaps to the next 3-hour grid slot aligned with window start', () => {
      // Window 09–21 (effective end 20). Urgent grid: 09, 12, 15, 18.
      // Now 10:00 + 1h buffer = 11:00 → next slot is 12:00.
      const task = makeTask(midnight(2026, 5, 12));
      const now = at(2026, 5, 12, 10);
      const next = computeNextAlarmAt(task, PREFS, now)!;
      expect(next).toBe(at(2026, 5, 12, 12));
    });

    it('urgent tier never produces a candidate carrying minute/second offsets from now', () => {
      const task = makeTask(midnight(2026, 5, 12));
      const next = computeNextAlarmAt(task, PREFS, at(2026, 5, 12, 13, 27, 53))!;
      const d = new Date(next);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });

    it('near tier rolls the morning slot to the right day even when called past midnight', () => {
      // Task due in 1 day ("near" tier). Now = late evening on May 12.
      // Candidate = start-of-day(now + 1 day) + startHour = May 13 09:00,
      // which is still before the May 13 21:00 effective deadline.
      const task = makeTask(midnight(2026, 5, 13));
      const now = at(2026, 5, 12, 22);
      const next = computeNextAlarmAt(task, PREFS, now)!;
      expect(next).toBe(at(2026, 5, 13, PREFS.operatingWindowStartHour));
    });
  });

  describe('notificationIdFor', () => {
    it('packs taskId and sequence number with the documented multiplier', () => {
      expect(notificationIdFor(1, 0)).toBe(1000);
      expect(notificationIdFor(1, 7)).toBe(1007);
      expect(notificationIdFor(42, 3)).toBe(42003);
    });

    it('gives every (taskId, seq) pair a unique notification id for seq 0..999', () => {
      // Bands of 1000 ids per task. Distinct tasks and distinct seqs both produce
      // distinct notification ids. The chain bumps the seq on each new ping, so
      // any in-flight ping for a given task is reachable for cancellation by
      // matching extra.taskId rather than by id arithmetic.
      expect(notificationIdFor(1, 0)).not.toBe(notificationIdFor(2, 0));
      expect(notificationIdFor(1, 5)).not.toBe(notificationIdFor(1, 6));
      expect(notificationIdFor(1, 999)).toBe(1999);
      expect(notificationIdFor(2, 0)).toBe(2000); // adjacent band starts cleanly
    });
  });
});
