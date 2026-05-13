// Generated — edit runners/verify-entry.ts, not this file.
"use strict";
(() => {
  // src/app/models/task.ts
  var DEFAULT_PREFS = {
    operatingWindowStartHour: 9,
    operatingWindowEndHour: 21,
    oemRiskTier: "none"
  };
  var KV_KEYS = {
    activeTasks: "activeTasks",
    completedTasks: "completedTasks",
    nextTaskId: "nextTaskId",
    userPrefs: "userPrefs",
    lastPingAt: "lastPingAt",
    pingHistory: "pingHistory",
    scheduleErrorAt: "scheduleErrorAt"
  };

  // src/app/services/scheduling-math.ts
  var DAY_MS = 24 * 60 * 60 * 1e3;
  var HOUR_MS = 60 * 60 * 1e3;
  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }
  function setHour(ts, hour) {
    const d = new Date(ts);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  }
  function effectiveDeadline(task, prefs) {
    return setHour(task.deadline, prefs.operatingWindowEndHour);
  }
  function computeTier(now, task, prefs) {
    if (now >= effectiveDeadline(task, prefs)) return "Expired" /* Expired */;
    if (startOfDay(now) === startOfDay(task.deadline)) return "Today" /* Today */;
    const daysAhead = Math.round((startOfDay(task.deadline) - startOfDay(now)) / DAY_MS);
    if (daysAhead <= 7) return "Soon" /* Soon */;
    return "Future" /* Future */;
  }
  function notificationBody(tier, taskName) {
    return `${tier}: ${taskName}`;
  }
  function nextMonday(now, startHour) {
    const day = new Date(now).getDay();
    const daysUntil = (1 - day + 7) % 7;
    const mondayAt = startOfDay(now) + daysUntil * DAY_MS + startHour * HOUR_MS;
    return mondayAt > now ? mondayAt : mondayAt + 7 * DAY_MS;
  }
  function computeNextAlarmAt(task, prefs, now) {
    const { operatingWindowStartHour: startHour, operatingWindowEndHour: endHour } = prefs;
    const tier = computeTier(now, task, prefs);
    switch (tier) {
      case "Expired" /* Expired */: {
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
        return candidate >= todayWindowEnd ? startOfDay(now + DAY_MS) + startHour * HOUR_MS : candidate;
      }
      case "Today" /* Today */: {
        const eff = effectiveDeadline(task, prefs);
        const windowStart = setHour(task.deadline, startHour);
        if (now < windowStart) return windowStart;
        const slotsAhead = Math.ceil((now - windowStart + 1) / (2 * HOUR_MS));
        const candidate = windowStart + slotsAhead * 2 * HOUR_MS;
        return candidate >= eff ? null : candidate;
      }
      case "Soon" /* Soon */: {
        const todayWindowStart = startOfDay(now) + startHour * HOUR_MS;
        return now < todayWindowStart ? todayWindowStart : startOfDay(now + DAY_MS) + startHour * HOUR_MS;
      }
      case "Future" /* Future */: {
        return nextMonday(now, startHour);
      }
    }
  }
  function notificationIdFor(taskId, sequenceNumber) {
    return taskId * 1e3 + sequenceNumber;
  }

  // runners/verify-entry.ts
  var PING_HISTORY_LIMIT = 20;
  function readJson(key, fallback) {
    const raw = CapacitorKV.get(key);
    if (raw === null || raw === void 0 || raw === "") return fallback;
    try {
      const str = typeof raw === "object" && raw.value !== void 0 ? raw.value : raw;
      return JSON.parse(str);
    } catch (_) {
      return fallback;
    }
  }
  function writeJson(key, value) {
    CapacitorKV.set(key, JSON.stringify(value));
  }
  function stampHeartbeat(now) {
    writeJson(KV_KEYS.lastPingAt, now);
    const history = readJson(KV_KEYS.pingHistory, []);
    history.unshift(now);
    if (history.length > PING_HISTORY_LIMIT) history.length = PING_HISTORY_LIMIT;
    writeJson(KV_KEYS.pingHistory, history);
  }
  addEventListener("verify", (resolve, reject) => {
    const now = Date.now();
    try {
      stampHeartbeat(now);
    } catch (_) {
    }
    try {
      const tasks = readJson(KV_KEYS.activeTasks, []);
      const prefs = readJson(KV_KEYS.userPrefs, DEFAULT_PREFS);
      let dirty = false;
      let hadScheduleError = false;
      for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        if (!t || t.status !== "active" || !t.remindMe) continue;
        const stale = t.nextAlarmAt === void 0 || t.nextAlarmAt === null || t.nextAlarmAt < now;
        if (!stale) continue;
        const at = computeNextAlarmAt(t, prefs, now);
        if (at === null) {
          t.nextAlarmAt = void 0;
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
            body: "",
            scheduleAt: new Date(at),
            actionTypeId: "TASK_ACTIONS",
            extra: { taskId: t.id }
          }]);
        } catch (schedErr) {
          console.error("[Bugger verify] CapacitorNotifications.schedule failed for task " + t.id + ": " + schedErr);
          hadScheduleError = true;
        }
        t.nextAlarmAt = at;
        dirty = true;
      }
      if (dirty) writeJson(KV_KEYS.activeTasks, tasks);
      writeJson(KV_KEYS.scheduleErrorAt, hadScheduleError ? now : null);
      resolve();
    } catch (err) {
      console.error("[Bugger verify] uncaught error: " + err);
      reject(err);
    }
  });
})();
