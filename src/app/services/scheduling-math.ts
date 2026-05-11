import { ProximityTier, Task, UserPrefs } from '../models/task';

// Pure functions — kept in lockstep with runners/verify.js (SYNC NOTE).

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// task.deadline is stored as midnight (local time) of the deadline day.
// The *actual* cutoff is end-of-operating-window minus the 1-hour safety
// buffer on that day — Android doesn't guarantee exact alarm delivery, so
// reserving the final hour of the window gives the OS slack to actually fire
// the last ping. (POC §5.)
export function effectiveDeadline(task: Pick<Task, 'deadline'>, prefs: UserPrefs): number {
  return setHour(task.deadline, effectiveEndHour(prefs));
}

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeTier(
  now: number,
  task: Pick<Task, 'deadline'>,
  prefs: UserPrefs,
): ProximityTier {
  const eff = effectiveDeadline(task, prefs);
  if (now >= eff) return 'expired';
  // Urgent = deadline date is today (or earlier, but not yet past cutoff).
  // Near   = deadline within the next 7 days.
  // Distant = further out.
  const todayStart = startOfDay(now);
  const deadlineDay = startOfDay(task.deadline);
  if (deadlineDay <= todayStart) return 'urgent';
  const daysAhead = Math.round((deadlineDay - todayStart) / DAY_MS);
  if (daysAhead <= 7) return 'near';
  return 'distant';
}

function effectiveEndHour(prefs: UserPrefs): number {
  // Safety buffer: no alarms in the final hour of the operating window.
  return prefs.operatingWindowEndHour - 1;
}

function setHour(ts: number, hour: number): number {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export function isWithinWindow(ts: number, prefs: UserPrefs): boolean {
  const hour = new Date(ts).getHours();
  return hour >= prefs.operatingWindowStartHour && hour < effectiveEndHour(prefs);
}

export function nextWindowOpenAt(ts: number, prefs: UserPrefs): number {
  const d = new Date(ts);
  const hour = d.getHours();
  if (hour < prefs.operatingWindowStartHour) {
    return setHour(ts, prefs.operatingWindowStartHour);
  }
  if (hour < effectiveEndHour(prefs)) {
    return ts;
  }
  return setHour(ts + DAY_MS, prefs.operatingWindowStartHour);
}

// Snap a target time to the next slot on a grid aligned with the operating
// window start. e.g. with startHour=9 and gridHours=3 the slots are 09:00,
// 12:00, 15:00, 18:00. Returns the earliest slot >= target. If today's grid
// is exhausted (past the safety-buffered window end), rolls to tomorrow's
// window-open.
function nextGridSlot(target: number, prefs: UserPrefs, gridHours: number): number {
  const day = startOfDay(target);
  const startMs = day + prefs.operatingWindowStartHour * HOUR_MS;
  const endMs = day + effectiveEndHour(prefs) * HOUR_MS;

  if (target <= startMs) return startMs;

  const slotsAhead = Math.ceil((target - startMs) / (gridHours * HOUR_MS));
  const candidate = startMs + slotsAhead * gridHours * HOUR_MS;
  if (candidate < endMs) return candidate;
  return startOfDay(target + DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
}

// Returns the next alarm timestamp, or null if no further pings should fire.
// All candidates land on the operating-window grid (startHour, or startHour +
// k*gridHours for urgent), so pings never carry an arbitrary wall-clock
// minute/second from `now`.
export function computeNextAlarmAt(
  task: Pick<Task, 'deadline'>,
  prefs: UserPrefs,
  now: number,
): number | null {
  const eff = effectiveDeadline(task, prefs);
  if (now >= eff) return null;

  const tier = computeTier(now, task, prefs);
  let candidate: number;

  switch (tier) {
    case 'distant':
      // 3 calendar days from now, at the operating window start hour.
      candidate = startOfDay(now + 3 * DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
      break;
    case 'near':
      // Next morning at the operating window start hour.
      candidate = startOfDay(now + DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
      break;
    case 'urgent':
      // Next slot on the 3-hour grid from window-start, at least one full hour
      // out so we never fire instantly the moment a task becomes urgent.
      candidate = nextGridSlot(now + HOUR_MS, prefs, 3);
      break;
    case 'expired':
      return null;
  }

  // Clamp to effective deadline — the final ping fires at the cutoff itself.
  if (candidate >= eff) return eff;
  return candidate;
}

export function notificationIdFor(taskId: number, sequenceNumber: number): number {
  return taskId * 1000 + sequenceNumber;
}
