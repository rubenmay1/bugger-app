import { DEFAULT_PREFS, KV_KEYS } from '../src/app/models/task';
import type { Task, UserPrefs } from '../src/app/models/task';
import { computeNextAlarmAt, computeTier, notificationBody, notificationIdFor } from '../src/app/services/scheduling-math';

declare const CapacitorKV: {
  get(key: string): any;
  set(key: string, value: string): void;
};
declare const CapacitorNotifications: {
  schedule(notifications: object[]): void;
};

const PING_HISTORY_LIMIT = 20;

function readJson(key: string, fallback: any): any {
  const raw = CapacitorKV.get(key);
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const str = typeof raw === 'object' && raw.value !== undefined ? raw.value : raw;
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  CapacitorKV.set(key, JSON.stringify(value));
}

function stampHeartbeat(now: number): void {
  writeJson(KV_KEYS.lastPingAt, now);
  const history: number[] = readJson(KV_KEYS.pingHistory, []);
  history.unshift(now);
  if (history.length > PING_HISTORY_LIMIT) history.length = PING_HISTORY_LIMIT;
  writeJson(KV_KEYS.pingHistory, history);
}

(addEventListener as any)('verify', (resolve: () => void, reject: (err: unknown) => void) => {
  const now = Date.now();

  try { stampHeartbeat(now); } catch (_) {}

  try {
    const tasks: Task[] = readJson(KV_KEYS.activeTasks, []);
    const prefs: UserPrefs = readJson(KV_KEYS.userPrefs, DEFAULT_PREFS);

    let dirty = false;
    let hadScheduleError = false;

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
      const title = notificationBody(computeTier(at, t, prefs), t.name);

      try {
        CapacitorNotifications.schedule([{
          id,
          title,
          body: '',
          scheduleAt: new Date(at),
          actionTypeId: 'TASK_ACTIONS',
          extra: { taskId: t.id },
        }]);
      } catch (schedErr) {
        console.error('[Bugger verify] CapacitorNotifications.schedule failed for task ' + t.id + ': ' + schedErr);
        hadScheduleError = true;
      }

      t.nextAlarmAt = at;
      dirty = true;
    }

    if (dirty) writeJson(KV_KEYS.activeTasks, tasks);
    writeJson(KV_KEYS.scheduleErrorAt, hadScheduleError ? now : null);
    resolve();
  } catch (err) {
    console.error('[Bugger verify] uncaught error: ' + err);
    reject(err);
  }
});
