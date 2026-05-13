import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Task, UserPrefs } from '../models/task';
import { computeNextAlarmAt, computeTier, notificationBody, notificationIdFor } from './scheduling-math';

export const HYDRA_CHANNEL_ID = 'bugger_hydra';
const TASK_ACTION_TYPE = 'TASK_ACTIONS';

@Injectable({ providedIn: 'root' })
export class SchedulerService {
  async ensureChannel(): Promise<void> {
    if (Capacitor.getPlatform() !== 'android') {
      return;
    }
    await LocalNotifications.createChannel({
      id: HYDRA_CHANNEL_ID,
      name: 'Reminders',
      description: 'Escalating reminders from Bugger',
      importance: 4, // IMPORTANCE_HIGH - heads-up + sound
      visibility: 1, // VISIBILITY_PUBLIC
      lights: true,
      vibration: true,
    });
  }

  async ensurePermission(): Promise<boolean> {
    try {
      const status = await LocalNotifications.checkPermissions();
      if (status.display === 'granted') {
        return true;
      }
      if (Capacitor.getPlatform() === 'web') {
        return false;
      }
      const req = await LocalNotifications.requestPermissions();
      return req.display === 'granted';
    } catch (err) {
      console.warn('LocalNotifications permission check failed', err);
      return false;
    }
  }

  async registerActions(): Promise<void> {
    if (Capacitor.getPlatform() === 'web') {
      return;
    }
    try {
      await LocalNotifications.registerActionTypes({
        types: [
          {
            id: TASK_ACTION_TYPE,
            actions: [{ id: 'complete', title: 'Mark as Completed' }],
          },
        ],
      });
    } catch (err) {
      console.warn('LocalNotifications.registerActionTypes failed', err);
    }
  }

  async scheduleNextLink(task: Task, prefs: UserPrefs, now: number = Date.now()): Promise<void> {
    if (!task.remindMe || task.status !== 'active') {
      return;
    }

    const at = computeNextAlarmAt(task, prefs, now);
    if (at === null) {
      task.nextAlarmAt = undefined;
      return;
    }

    task.sequenceNumber += 1;
    task.nextAlarmAt = at;
    const id = notificationIdFor(task.id, task.sequenceNumber);
    const title = notificationBody(computeTier(at, task, prefs), task.name);

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body: '',
            schedule: { at: new Date(at), allowWhileIdle: true },
            extra: { taskId: task.id },
            actionTypeId: TASK_ACTION_TYPE,
            channelId: HYDRA_CHANNEL_ID,
          },
        ],
      });
    } catch (err) {
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
}
