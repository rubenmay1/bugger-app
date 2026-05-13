import { ProximityTier, Task, UserPrefs } from '../models/task';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const SLOT_MS = 2 * HOUR_MS;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function setHour(ts: number, hour: number): number {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

export function effectiveDeadline(task: Pick<Task, 'deadline'>, prefs: UserPrefs): number {
  return setHour(task.deadline, prefs.operatingWindowEndHour);
}

export function computeTier(now: number, task: Pick<Task, 'deadline'>, prefs: UserPrefs): ProximityTier {
  if (now >= effectiveDeadline(task, prefs)) {
    return ProximityTier.Expired;
  }
  if (startOfDay(now) === startOfDay(task.deadline)) {
    return ProximityTier.Today;
  }
  const daysAhead = Math.round((startOfDay(task.deadline) - startOfDay(now)) / DAY_MS);
  if (daysAhead <= 7) {
    return ProximityTier.Soon;
  }
  return ProximityTier.Future;
}

export function notificationBody(tier: ProximityTier, taskName: string): string {
  return `${tier}: ${taskName}`;
}

export function notificationIdFor(taskId: number, sequenceNumber: number): number {
  return taskId * 1000 + sequenceNumber;
}

function nextMonday(now: number, startHour: number): number {
  const day = new Date(now).getDay();
  const daysUntil = (1 - day + 7) % 7;
  const mondayAt = startOfDay(now) + daysUntil * DAY_MS + startHour * HOUR_MS;
  return mondayAt > now ? mondayAt : mondayAt + 7 * DAY_MS;
}

// Returns the next alarm timestamp on the 2-hour grid, or null if no slot
// remains today before the effective deadline (Today tier only).
export function computeNextAlarmAt(
  task: Pick<Task, 'deadline'>,
  prefs: UserPrefs,
  now: number,
): number | null {
  const { operatingWindowStartHour: startHour, operatingWindowEndHour: endHour } = prefs;
  const tier = computeTier(now, task, prefs);

  switch (tier) {
    case ProximityTier.Expired: {
      // Every 2 hours during today's operating window; otherwise next day start.
      const todayWindowStart = startOfDay(now) + startHour * HOUR_MS;
      const todayWindowEnd = startOfDay(now) + endHour * HOUR_MS;

      if (now >= todayWindowEnd) {
        return startOfDay(now + DAY_MS) + startHour * HOUR_MS;
      }
      if (now < todayWindowStart) {
        return todayWindowStart;
      }

      const slotsAhead = Math.ceil((now - todayWindowStart + 1) / SLOT_MS);
      const candidate = todayWindowStart + slotsAhead * SLOT_MS;
      return candidate >= todayWindowEnd
        ? startOfDay(now + DAY_MS) + startHour * HOUR_MS
        : candidate;
    }

    case ProximityTier.Today: {
      // Every 2 hours from window start, until the effective deadline.
      const eff = effectiveDeadline(task, prefs);
      const windowStart = setHour(task.deadline, startHour);

      if (now < windowStart) {
        return windowStart;
      }

      const slotsAhead = Math.ceil((now - windowStart + 1) / SLOT_MS);
      const candidate = windowStart + slotsAhead * SLOT_MS;
      return candidate >= eff ? null : candidate;
    }

    case ProximityTier.Soon: {
      // Once per day at window start.
      const todayWindowStart = startOfDay(now) + startHour * HOUR_MS;
      return now < todayWindowStart
        ? todayWindowStart
        : startOfDay(now + DAY_MS) + startHour * HOUR_MS;
    }

    case ProximityTier.Future: {
      // Once per week, next Monday at window start.
      return nextMonday(now, startHour);
    }
  }
}
