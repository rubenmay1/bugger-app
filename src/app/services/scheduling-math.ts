import { ProximityTier, Task, UserPrefs } from '../models/task';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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
  // Past the effective cutoff on the deadline day.
  if (now >= effectiveDeadline(task, prefs)) {
    return ProximityTier.Expired;
  }

  // Deadline is today (and we're still before the cutoff).
  if (startOfDay(now) === startOfDay(task.deadline)) {
    return ProximityTier.Today;
  }

  // Deadline within the next week.
  const daysAhead = Math.round((startOfDay(task.deadline) - startOfDay(now)) / DAY_MS);
  if (daysAhead <= 7) {
    return ProximityTier.Soon;
  }

  // More than a week away.
  return ProximityTier.Future;
}

export function notificationBody(tier: ProximityTier, taskName: string): string {
  return `${tier}: ${taskName}`;
}

function nextMonday(now: number, startHour: number): number {
  const day = new Date(now).getDay();
  const daysUntil = (1 - day + 7) % 7;
  const mondayAt = startOfDay(now) + daysUntil * DAY_MS + startHour * HOUR_MS;
  return mondayAt > now ? mondayAt : mondayAt + 7 * DAY_MS;
}

export function computeNextAlarmAt(
  task: Pick<Task, 'deadline'>,
  prefs: UserPrefs,
  now: number,
): number | null {
  const { operatingWindowStartHour: startHour, operatingWindowEndHour: endHour } = prefs;
  const tier = computeTier(now, task, prefs);

  switch (tier) {
    // Expired: every 2 hours during today's operating window. After window end -> tomorrow's start.
    case ProximityTier.Expired: {
      const todayWindowStart = startOfDay(now) + startHour * HOUR_MS;
      const todayWindowEnd = startOfDay(now) + endHour * HOUR_MS;

      if (now >= todayWindowEnd) {
        return startOfDay(now + DAY_MS) + startHour * HOUR_MS;
      }
      if (now < todayWindowStart) {
        return todayWindowStart;
      }

      const slotsAhead = Math.ceil((now - todayWindowStart + 1) / (2 * HOUR_MS));
      const candidate = todayWindowStart + slotsAhead * 2 * HOUR_MS;
      return candidate >= todayWindowEnd
        ? startOfDay(now + DAY_MS) + startHour * HOUR_MS
        : candidate;
    }

    // Today: every 2 hours from window start, until the effective deadline.
    case ProximityTier.Today: {
      const eff = effectiveDeadline(task, prefs);
      const windowStart = setHour(task.deadline, startHour);

      if (now < windowStart) {
        return windowStart;
      }

      const slotsAhead = Math.ceil((now - windowStart + 1) / (2 * HOUR_MS));
      const candidate = windowStart + slotsAhead * 2 * HOUR_MS;
      return candidate >= eff ? null : candidate;
    }

    // Soon: once per day at window start.
    case ProximityTier.Soon: {
      const todayWindowStart = startOfDay(now) + startHour * HOUR_MS;
      return now < todayWindowStart
        ? todayWindowStart
        : startOfDay(now + DAY_MS) + startHour * HOUR_MS;
    }

    // Future: once per week, next Monday at window start.
    case ProximityTier.Future: {
      return nextMonday(now, startHour);
    }
  }
}

export function notificationIdFor(taskId: number, sequenceNumber: number): number {
  return taskId * 1000 + sequenceNumber;
}
