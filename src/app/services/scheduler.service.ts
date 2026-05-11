import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Task, UserPrefs } from '../models/task';
import { computeNextAlarmAt, effectiveDeadline, notificationIdFor } from './scheduling-math';

export const HYDRA_CHANNEL_ID = 'bugger_hydra';

@Injectable({ providedIn: 'root' })
export class SchedulerService {
  async ensureChannel(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') return;
    await LocalNotifications.createChannel({
      id: HYDRA_CHANNEL_ID,
      name: 'Reminders',
      description: 'Escalating reminders from Bugger',
      importance: 4, // IMPORTANCE_HIGH — heads-up + sound
      visibility: 1, // VISIBILITY_PUBLIC
      lights: true,
      vibration: true,
    });
  }

  async ensurePermission(): Promise<boolean> {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') return true;
      // Browsers (and the Capacitor web shim) require requestPermissions to
      // be inside a user-gesture handler. Skip the auto-request on web to
      // avoid a "permission may only be requested from a user-generated
      // event" exception during app boot.
      if (Capacitor.getPlatform() === 'web') return false;
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    } catch (err) {
      console.warn('LocalNotifications permission check failed', err);
      return false;
    }
  }

  // Mutates `task` (sets nextAlarmAt and bumps sequenceNumber). Caller persists.
  // The OS schedule call is best-effort — we record the intended time first so
  // the Next Alarms UI stays accurate even when the plugin shim throws (web).
  async scheduleNextLink(task: Task, prefs: UserPrefs, now: number = Date.now()): Promise<void> {
    if (!task.remindMe || task.status !== 'active') return;

    const at = computeNextAlarmAt(task, prefs, now);
    if (at === null) {
      task.nextAlarmAt = undefined;
      return;
    }

    task.sequenceNumber += 1;
    task.nextAlarmAt = at;
    const id = notificationIdFor(task.id, task.sequenceNumber);
    const isFinal = at === effectiveDeadline(task, prefs);
    const body = isFinal ? `Final Reminder: ${task.name}` : task.name;

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: 'Bugger',
            body,
            schedule: { at: new Date(at), allowWhileIdle: true },
            extra: { taskId: task.id },
            actionTypeId: 'TASK_ACTIONS',
            channelId: HYDRA_CHANNEL_ID,
          },
        ],
      });
    } catch (err) {
      // Native plugin not available (or rejected) — the in-app state still
      // reflects the intended ping. The verifier will sync it on Android.
      console.warn('LocalNotifications.schedule failed', err);
    }
  }

  async cancelTaskAlarms(task: Task): Promise<void> {
    const pending = await LocalNotifications.getPending();
    const ids = pending.notifications
      .filter(n => n.extra?.taskId === task.id)
      .map(n => ({ id: n.id }));
    if (ids.length > 0) {
      await LocalNotifications.cancel({ notifications: ids });
    }
    task.nextAlarmAt = undefined;
  }

  async getPending() {
    return LocalNotifications.getPending();
  }

  async registerActions(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') return; // not implemented on web shim
    try {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: 'TASK_ACTIONS',
            actions: [{ id: 'complete', title: 'Mark as Completed' }],
          },
        ],
      });
    } catch (err) {
      console.warn('LocalNotifications.registerActionTypes failed', err);
    }
  }
}
