import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_PREFS, KV_KEYS, Task, UserPrefs } from '../models/task';
import { KvService } from './kv.service';
import { SchedulerService } from './scheduler.service';
import { startOfDay } from './scheduling-math';

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly activeSubject = new BehaviorSubject<Task[]>([]);
  private readonly completedSubject = new BehaviorSubject<Task[]>([]);
  private readonly prefsSubject = new BehaviorSubject<UserPrefs>(DEFAULT_PREFS);

  readonly active$ = this.activeSubject.asObservable();
  readonly completed$ = this.completedSubject.asObservable();
  readonly prefs$ = this.prefsSubject.asObservable();

  constructor(private kv: KvService, private scheduler: SchedulerService) {}

  async load(): Promise<void> {
    const [active, completed, prefs] = await Promise.all([
      this.kv.get<Task[]>(KV_KEYS.activeTasks),
      this.kv.get<Task[]>(KV_KEYS.completedTasks),
      this.kv.get<UserPrefs>(KV_KEYS.userPrefs),
    ]);
    // Migrations:
    //   1. Deadlines are now midnight-of-day — snap legacy full timestamps.
    //   2. Pre-grid scheduler produced nextAlarmAt values carrying the
    //      wall-clock minute/second of the moment they were computed. Drop
    //      those so the next selfTest reschedules cleanly on the grid.
    const migrate = (t: Task): Task => {
      const day = startOfDay(t.deadline);
      const offGrid = t.nextAlarmAt !== undefined && !isOnGrid(t.nextAlarmAt);
      if (day === t.deadline && !offGrid) return t;
      const out: Task = { ...t, deadline: day };
      if (offGrid) out.nextAlarmAt = undefined;
      return out;
    };
    const activeM = (active ?? []).map(migrate);
    const completedM = (completed ?? []).map(migrate);
    const dirtyActive = activeM.some((t, i) => t !== (active ?? [])[i]);
    const dirtyCompleted = completedM.some((t, i) => t !== (completed ?? [])[i]);
    this.activeSubject.next(activeM);
    this.completedSubject.next(completedM);
    this.prefsSubject.next(prefs ?? DEFAULT_PREFS);
    if (dirtyActive) await this.kv.set(KV_KEYS.activeTasks, activeM);
    if (dirtyCompleted) await this.kv.set(KV_KEYS.completedTasks, completedM);
  }

  private get active() { return this.activeSubject.value; }
  private get completed() { return this.completedSubject.value; }
  private get prefs() { return this.prefsSubject.value; }

  get currentPrefs(): UserPrefs { return this.prefsSubject.value; }
  get currentActive(): Task[] { return this.activeSubject.value; }
  get currentCompleted(): Task[] { return this.completedSubject.value; }

  private async persistActive() {
    await this.kv.set(KV_KEYS.activeTasks, this.active);
  }

  private async persistCompleted() {
    await this.kv.set(KV_KEYS.completedTasks, this.completed);
  }

  async updatePrefs(prefs: UserPrefs): Promise<void> {
    this.prefsSubject.next(prefs);
    await this.kv.set(KV_KEYS.userPrefs, prefs);
  }

  private async nextTaskId(): Promise<number> {
    const current = (await this.kv.get<number>(KV_KEYS.nextTaskId)) ?? 1;
    await this.kv.set(KV_KEYS.nextTaskId, current + 1);
    return current;
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
      await this.scheduler.scheduleNextLink(task, this.prefs);
    }
    this.activeSubject.next([...this.active, task]);
    await this.persistActive();
    return task;
  }

  async edit(id: number, patch: Partial<Pick<Task, 'name' | 'deadline' | 'remindMe'>>): Promise<void> {
    const idx = this.active.findIndex(t => t.id === id);
    if (idx < 0) return;
    const updated: Task = { ...this.active[idx], ...patch };
    await this.scheduler.cancelTaskAlarms(updated);
    if (updated.remindMe) {
      await this.scheduler.scheduleNextLink(updated, this.prefs);
    }
    const next = [...this.active];
    next[idx] = updated;
    this.activeSubject.next(next);
    await this.persistActive();
  }

  async complete(id: number): Promise<void> {
    const idx = this.active.findIndex(t => t.id === id);
    if (idx < 0) return;
    const task = this.active[idx];
    await this.scheduler.cancelTaskAlarms(task);
    const done: Task = { ...task, status: 'completed', completedAt: Date.now(), nextAlarmAt: undefined };
    const nextActive = this.active.filter(t => t.id !== id);
    this.activeSubject.next(nextActive);
    this.completedSubject.next([done, ...this.completed]);
    await Promise.all([this.persistActive(), this.persistCompleted()]);
  }

  async delete(id: number): Promise<void> {
    const task = this.active.find(t => t.id === id);
    if (task) await this.scheduler.cancelTaskAlarms(task);
    this.activeSubject.next(this.active.filter(t => t.id !== id));
    await this.persistActive();
  }

  // Self-test on app open — silently reschedule any active task whose alarm
  // is missing, in the past, or carries a wall-clock fraction left over from
  // the pre-grid scheduling code (which let `now + N days` keep its minutes
  // and seconds).
  async selfTest(): Promise<void> {
    const pending = await this.scheduler.getPending();
    const pendingByTask = new Set(
      pending.notifications.map(n => n.extra?.taskId).filter((x): x is number => typeof x === 'number'),
    );
    const next = [...this.active];
    let dirty = false;
    for (let i = 0; i < next.length; i++) {
      const t = next[i];
      if (!t.remindMe || t.status !== 'active') continue;
      const driftedOffGrid = t.nextAlarmAt !== undefined && !isOnGrid(t.nextAlarmAt);
      const needsReschedule =
        !pendingByTask.has(t.id) ||
        (t.nextAlarmAt !== undefined && t.nextAlarmAt < Date.now()) ||
        driftedOffGrid;
      if (needsReschedule) {
        const updated = { ...t };
        if (driftedOffGrid) await this.scheduler.cancelTaskAlarms(updated);
        await this.scheduler.scheduleNextLink(updated, this.prefs);
        next[i] = updated;
        dirty = true;
      }
    }
    if (dirty) {
      this.activeSubject.next(next);
      await this.persistActive();
    }
  }
}

function isOnGrid(ts: number): boolean {
  const d = new Date(ts);
  return d.getMinutes() === 0 && d.getSeconds() === 0 && d.getMilliseconds() === 0;
}
