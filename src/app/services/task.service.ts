import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PREFS, KV_KEYS, Task, UserPrefs } from '../models/task';
import { KvService } from './kv.service';
import { SchedulerService } from './scheduler.service';
import { startOfDay } from './scheduling-math';

function isOnGrid(ts: number): boolean {
  const d = new Date(ts);
  return d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}

function normalise(t: Task): Task {
  const day = startOfDay(t.deadline);
  const offGrid = t.nextAlarmAt !== undefined && !isOnGrid(t.nextAlarmAt);
  if (day === t.deadline && !offGrid) {
    return t;
  }
  const out: Task = { ...t, deadline: day };
  if (offGrid) {
    out.nextAlarmAt = undefined;
  }
  return out;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly activeSubject = new BehaviorSubject<Task[]>([]);
  private readonly completedSubject = new BehaviorSubject<Task[]>([]);
  private readonly prefsSubject = new BehaviorSubject<UserPrefs>(DEFAULT_PREFS);

  readonly active$ = this.activeSubject.asObservable();
  readonly completed$ = this.completedSubject.asObservable();
  readonly prefs$ = this.prefsSubject.asObservable();

  constructor(private kv: KvService, private scheduler: SchedulerService) {}

  get currentActive(): Task[] { return this.activeSubject.value; }
  get currentCompleted(): Task[] { return this.completedSubject.value; }
  get currentPrefs(): UserPrefs { return this.prefsSubject.value; }

  async load(): Promise<void> {
    const [active, completed, prefs] = await Promise.all([
      this.kv.get<Task[]>(KV_KEYS.activeTasks),
      this.kv.get<Task[]>(KV_KEYS.completedTasks),
      this.kv.get<UserPrefs>(KV_KEYS.userPrefs),
    ]);
    const activeStored = active ?? [];
    const completedStored = completed ?? [];
    const activeMigrated = activeStored.map(normalise);
    const completedMigrated = completedStored.map(normalise);
    this.activeSubject.next(activeMigrated);
    this.completedSubject.next(completedMigrated);
    this.prefsSubject.next(prefs ?? DEFAULT_PREFS);
    if (activeMigrated.some((t, i) => t !== activeStored[i])) {
      await this.persistActive();
    }
    if (completedMigrated.some((t, i) => t !== completedStored[i])) {
      await this.persistCompleted();
    }
  }

  async updatePrefs(prefs: UserPrefs): Promise<void> {
    this.prefsSubject.next(prefs);
    await this.kv.set(KV_KEYS.userPrefs, prefs);
  }

  async create(input: { name: string; deadline: number; remindMe: boolean }): Promise<Task> {
    const id = await this.nextTaskId();
    const task: Task = {
      id,
      name: input.name,
      createdAt: Date.now(),
      deadline: input.deadline,
      remindMe: input.remindMe,
      status: 'active',
      sequenceNumber: 0,
    };
    if (task.remindMe) {
      await this.scheduler.scheduleNextLink(task, this.currentPrefs);
    }
    this.activeSubject.next([...this.currentActive, task]);
    await this.persistActive();
    return task;
  }

  async edit(id: number, patch: Partial<Pick<Task, 'name' | 'deadline' | 'remindMe'>>): Promise<void> {
    const idx = this.currentActive.findIndex(t => t.id === id);
    if (idx < 0) {
      return;
    }
    const updated: Task = { ...this.currentActive[idx], ...patch };
    await this.scheduler.cancelTaskAlarms(updated);
    if (updated.remindMe) {
      await this.scheduler.scheduleNextLink(updated, this.currentPrefs);
    }
    const next = [...this.currentActive];
    next[idx] = updated;
    this.activeSubject.next(next);
    await this.persistActive();
  }

  async complete(id: number): Promise<void> {
    const idx = this.currentActive.findIndex(t => t.id === id);
    if (idx < 0) {
      return;
    }
    const task = this.currentActive[idx];
    await this.scheduler.cancelTaskAlarms(task);
    const done: Task = { ...task, status: 'completed', completedAt: Date.now(), nextAlarmAt: undefined };
    this.activeSubject.next(this.currentActive.filter(t => t.id !== id));
    this.completedSubject.next([done, ...this.currentCompleted]);
    await Promise.all([this.persistActive(), this.persistCompleted()]);
  }

  async delete(id: number): Promise<void> {
    const task = this.currentActive.find(t => t.id === id);
    if (task) {
      await this.scheduler.cancelTaskAlarms(task);
    }
    this.activeSubject.next(this.currentActive.filter(t => t.id !== id));
    await this.persistActive();
  }

  async rescheduleAll(): Promise<void> {
    const prefs = this.currentPrefs;
    const next = [...this.currentActive];
    let dirty = false;
    for (let i = 0; i < next.length; i++) {
      const t = next[i];
      if (!t.remindMe || t.status !== 'active') {
        continue;
      }
      const updated = { ...t };
      await this.scheduler.cancelTaskAlarms(updated);
      await this.scheduler.scheduleNextLink(updated, prefs);
      next[i] = updated;
      dirty = true;
    }
    if (dirty) {
      this.activeSubject.next(next);
      await this.persistActive();
    }
  }

  async selfTest(): Promise<void> {
    const pending = await this.scheduler.getPending();
    const pendingByTask = new Set(
      pending.notifications.map(n => n.extra?.taskId).filter((x): x is number => typeof x === 'number'),
    );
    const next = [...this.currentActive];
    let dirty = false;
    for (let i = 0; i < next.length; i++) {
      const t = next[i];
      if (!t.remindMe || t.status !== 'active') {
        continue;
      }
      const driftedOffGrid = t.nextAlarmAt !== undefined && !isOnGrid(t.nextAlarmAt);
      const needsReschedule =
        !pendingByTask.has(t.id) ||
        (t.nextAlarmAt !== undefined && t.nextAlarmAt < Date.now()) ||
        driftedOffGrid;
      if (!needsReschedule) {
        continue;
      }
      const updated = { ...t };
      if (driftedOffGrid) {
        await this.scheduler.cancelTaskAlarms(updated);
      }
      await this.scheduler.scheduleNextLink(updated, this.currentPrefs);
      next[i] = updated;
      dirty = true;
    }
    if (dirty) {
      this.activeSubject.next(next);
      await this.persistActive();
    }
  }

  private async nextTaskId(): Promise<number> {
    const current = (await this.kv.get<number>(KV_KEYS.nextTaskId)) ?? 1;
    await this.kv.set(KV_KEYS.nextTaskId, current + 1);
    return current;
  }

  private async persistActive(): Promise<void> {
    await this.kv.set(KV_KEYS.activeTasks, this.currentActive);
  }

  private async persistCompleted(): Promise<void> {
    await this.kv.set(KV_KEYS.completedTasks, this.currentCompleted);
  }
}
