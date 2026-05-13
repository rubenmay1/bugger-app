import {
  computeNextAlarmAt,
  computeTier,
  effectiveDeadline,
  notificationBody,
  notificationIdFor,
  startOfDay,
} from './scheduling-math';
import { ProximityTier, Task, UserPrefs } from '../models/task';

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
      expect(startOfDay(at(2026, 5, 12, 14, 37))).toBe(midnight(2026, 5, 12));
    });

    it('is idempotent for timestamps already at midnight', () => {
      const m = midnight(2026, 5, 12);
      expect(startOfDay(m)).toBe(m);
    });
  });

  describe('effectiveDeadline', () => {
    it('returns the end of the operating window on the deadline day', () => {
      const task = makeTask(midnight(2026, 5, 12));
      expect(effectiveDeadline(task, PREFS)).toBe(at(2026, 5, 12, 21));
    });

    it('honours different operatingWindowEndHour values', () => {
      const task = makeTask(midnight(2026, 5, 12));
      const prefs: UserPrefs = { ...PREFS, operatingWindowEndHour: 18 };
      expect(effectiveDeadline(task, prefs)).toBe(at(2026, 5, 12, 18));
    });
  });

  describe('computeTier', () => {
    const today = midnight(2026, 5, 12);

    it('returns Expired once now is past the end of the operating window on the deadline day', () => {
      expect(computeTier(at(2026, 5, 12, 21, 1), makeTask(today), PREFS)).toBe(ProximityTier.Expired);
    });

    it('returns Expired for a task whose deadline day was in the past', () => {
      expect(computeTier(at(2026, 5, 13, 10), makeTask(today), PREFS)).toBe(ProximityTier.Expired);
    });

    it('returns Today for any time before effectiveDeadline on the deadline day', () => {
      expect(computeTier(at(2026, 5, 12, 10), makeTask(today), PREFS)).toBe(ProximityTier.Today);
      expect(computeTier(at(2026, 5, 12, 7), makeTask(today), PREFS)).toBe(ProximityTier.Today);
      expect(computeTier(at(2026, 5, 12, 19), makeTask(today), PREFS)).toBe(ProximityTier.Today);
      expect(computeTier(at(2026, 5, 12, 20, 30), makeTask(today), PREFS)).toBe(ProximityTier.Today);
    });

    it('returns Soon for 1–7 calendar days ahead', () => {
      const now = at(2026, 5, 12, 10);
      for (let d = 1; d <= 7; d++) {
        expect(computeTier(now, makeTask(midnight(2026, 5, 12 + d)), PREFS)).toBe(ProximityTier.Soon);
      }
    });

    it('returns Future for more than 7 calendar days ahead', () => {
      const now = at(2026, 5, 12, 10);
      expect(computeTier(now, makeTask(midnight(2026, 5, 20)), PREFS)).toBe(ProximityTier.Future);
    });
  });

  describe('notificationBody', () => {
    it('prefixes each notification with its tier name', () => {
      expect(notificationBody(ProximityTier.Expired, 'Buy milk')).toBe('Expired: Buy milk');
      expect(notificationBody(ProximityTier.Today, 'Buy milk')).toBe('Today: Buy milk');
      expect(notificationBody(ProximityTier.Soon, 'Buy milk')).toBe('Soon: Buy milk');
      expect(notificationBody(ProximityTier.Future, 'Buy milk')).toBe('Future: Buy milk');
    });
  });

  describe('computeNextAlarmAt', () => {
    const today = midnight(2026, 5, 12);

    it('Expired: returns today window-start when called before it opens', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 13, 7))).toBe(at(2026, 5, 13, 9));
    });

    it('Expired: advances on the 2-hour grid during the window', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 13, 9))).toBe(at(2026, 5, 13, 11));
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 13, 10, 30))).toBe(at(2026, 5, 13, 11));
    });

    it('Expired: rolls to next day window-start when at or past window end', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 13, 21))).toBe(at(2026, 5, 14, 9));
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 13, 22))).toBe(at(2026, 5, 14, 9));
    });

    it('Today: returns the window-start slot when called before the window opens', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 7))).toBe(at(2026, 5, 12, 9));
    });

    it('Today: advances to the next 2-hour slot from window start', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 9))).toBe(at(2026, 5, 12, 11));
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 10, 30))).toBe(at(2026, 5, 12, 11));
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 11))).toBe(at(2026, 5, 12, 13));
    });

    it('Today: returns null when the next slot would reach or pass effectiveDeadline', () => {
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 19))).toBeNull();
      expect(computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 17))).toBe(at(2026, 5, 12, 19));
    });

    it('Today: result never carries minute/second offsets from now', () => {
      const next = computeNextAlarmAt(makeTask(today), PREFS, at(2026, 5, 12, 10, 27, 45))!;
      const d = new Date(next);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
    });

    it('Soon: returns today window-start when called before it opens', () => {
      const task = makeTask(midnight(2026, 5, 16));
      expect(computeNextAlarmAt(task, PREFS, at(2026, 5, 12, 7))).toBe(at(2026, 5, 12, 9));
    });

    it('Soon: returns tomorrow window-start when called after it has opened today', () => {
      const task = makeTask(midnight(2026, 5, 16));
      expect(computeNextAlarmAt(task, PREFS, at(2026, 5, 12, 14))).toBe(at(2026, 5, 13, 9));
    });

    it('Future: returns the coming Monday at window-start', () => {
      // May 12 2026 is a Tuesday. Next Monday = May 18.
      const task = makeTask(midnight(2026, 6, 1));
      const next = computeNextAlarmAt(task, PREFS, at(2026, 5, 12, 10));
      expect(next).toBe(at(2026, 5, 18, 9));
    });

    it('Future: returns the same Monday when called before window-start on a Monday', () => {
      // May 18 2026 is a Monday.
      const task = makeTask(midnight(2026, 6, 1));
      expect(computeNextAlarmAt(task, PREFS, at(2026, 5, 18, 7))).toBe(at(2026, 5, 18, 9));
    });

    it('Future: advances to next Monday when called after window-start on a Monday', () => {
      const task = makeTask(midnight(2026, 6, 1));
      expect(computeNextAlarmAt(task, PREFS, at(2026, 5, 18, 11))).toBe(at(2026, 5, 25, 9));
    });
  });

  describe('notificationIdFor', () => {
    it('packs taskId and sequence number with the documented multiplier', () => {
      expect(notificationIdFor(1, 0)).toBe(1000);
      expect(notificationIdFor(1, 7)).toBe(1007);
      expect(notificationIdFor(42, 3)).toBe(42003);
    });

    it('gives every (taskId, seq) pair a unique notification id for seq 0..999', () => {
      expect(notificationIdFor(1, 0)).not.toBe(notificationIdFor(2, 0));
      expect(notificationIdFor(1, 5)).not.toBe(notificationIdFor(1, 6));
      expect(notificationIdFor(1, 999)).toBe(1999);
      expect(notificationIdFor(2, 0)).toBe(2000);
    });
  });
});
