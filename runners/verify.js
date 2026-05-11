// Bugger background verifier.
//
// Runs every 15 minutes via @capacitor/background-runner (WorkManager-backed).
// Contract: INITIAL_POC.md §9.
//
// SYNC NOTE: the scheduling math below must mirror src/app/services/scheduling-math.ts.
// Keep them in lockstep — changes to one require updating the other.
//
// Globals injected by the runner: CapacitorKV, CapacitorNotifications.
// No DOM, no fetch, no Ionic state.

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const PING_HISTORY_LIMIT = 20;

const KV_KEYS = {
  activeTasks: 'activeTasks',
  userPrefs: 'userPrefs',
  lastPingAt: 'lastPingAt',
  pingHistory: 'pingHistory',
};

const DEFAULT_PREFS = {
  operatingWindowStartHour: 9,
  operatingWindowEndHour: 21,
  oemRiskTier: 'none',
};

function readJson(key, fallback) {
  const raw = CapacitorKV.get(key);
  if (raw === null || raw === undefined || raw === '') return fallback;
  try { return JSON.parse(raw.value !== undefined ? raw.value : raw); }
  catch (_) { return fallback; }
}

function writeJson(key, value) {
  CapacitorKV.set(key, JSON.stringify(value));
}

function effectiveEndHour(prefs) { return prefs.operatingWindowEndHour - 1; }

function setHour(ts, hour) {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function nextWindowOpenAt(ts, prefs) {
  const d = new Date(ts);
  const hour = d.getHours();
  if (hour < prefs.operatingWindowStartHour) return setHour(ts, prefs.operatingWindowStartHour);
  if (hour < effectiveEndHour(prefs)) return ts;
  return setHour(ts + DAY_MS, prefs.operatingWindowStartHour);
}

function effectiveDeadline(task, prefs) {
  // task.deadline is stored as midnight of the deadline day; the actual
  // cutoff is end-of-window minus the 1h safety buffer so Android has slack
  // to actually deliver the final ping.
  return setHour(task.deadline, effectiveEndHour(prefs));
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function computeTier(now, task, prefs) {
  const eff = effectiveDeadline(task, prefs);
  if (now >= eff) return 'expired';
  const todayStart = startOfDay(now);
  const deadlineDay = startOfDay(task.deadline);
  if (deadlineDay <= todayStart) return 'urgent';
  const daysAhead = Math.round((deadlineDay - todayStart) / DAY_MS);
  if (daysAhead <= 7) return 'near';
  return 'distant';
}

function nextGridSlot(target, prefs, gridHours) {
  const day = startOfDay(target);
  const startMs = day + prefs.operatingWindowStartHour * HOUR_MS;
  const endMs = day + effectiveEndHour(prefs) * HOUR_MS;
  if (target <= startMs) return startMs;
  const slotsAhead = Math.ceil((target - startMs) / (gridHours * HOUR_MS));
  const candidate = startMs + slotsAhead * gridHours * HOUR_MS;
  if (candidate < endMs) return candidate;
  return startOfDay(target + DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
}

function computeNextAlarmAt(task, prefs, now) {
  const eff = effectiveDeadline(task, prefs);
  if (now >= eff) return null;
  const tier = computeTier(now, task, prefs);
  let candidate;
  switch (tier) {
    case 'distant':
      candidate = startOfDay(now + 3 * DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
      break;
    case 'near':
      candidate = startOfDay(now + DAY_MS) + prefs.operatingWindowStartHour * HOUR_MS;
      break;
    case 'urgent':
      candidate = nextGridSlot(now + HOUR_MS, prefs, 3);
      break;
    default:
      return null;
  }
  if (candidate >= eff) return eff;
  return candidate;
}

function notificationIdFor(taskId, seq) { return taskId * 1000 + seq; }

function stampHeartbeat(now) {
  writeJson(KV_KEYS.lastPingAt, now);
  const history = readJson(KV_KEYS.pingHistory, []);
  history.unshift(now);
  if (history.length > PING_HISTORY_LIMIT) history.length = PING_HISTORY_LIMIT;
  writeJson(KV_KEYS.pingHistory, history);
}

addEventListener('verify', (resolve, reject, args) => {
  try {
    const now = Date.now();
    const tasks = readJson(KV_KEYS.activeTasks, []);
    const prefs = readJson(KV_KEYS.userPrefs, DEFAULT_PREFS);

    let dirty = false;
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (!t || t.status !== 'active' || !t.remindMe) continue;
      const stale = t.nextAlarmAt === undefined || t.nextAlarmAt === null || t.nextAlarmAt < now;
      if (!stale) continue;

      const at = computeNextAlarmAt(t, prefs, now);
      if (at === null) {
        t.nextAlarmAt = undefined;
        dirty = true;
        continue;
      }
      t.sequenceNumber = (t.sequenceNumber || 0) + 1;
      const id = notificationIdFor(t.id, t.sequenceNumber);
      const isFinal = at === effectiveDeadline(t, prefs);
      const body = isFinal ? 'Final Reminder: ' + t.name : t.name;

      CapacitorNotifications.schedule([
        {
          id,
          title: 'Bugger',
          body,
          scheduleAt: new Date(at),
          extra: { taskId: t.id },
        },
      ]);

      t.nextAlarmAt = at;
      dirty = true;
    }

    if (dirty) writeJson(KV_KEYS.activeTasks, tasks);
    stampHeartbeat(now);
    resolve();
  } catch (err) {
    try { stampHeartbeat(Date.now()); } catch (_) {}
    reject(err);
  }
});
