import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Task, UserPrefs } from '../models/task';
import { TaskService } from '../services/task.service';

type DeadlineKey = 'keep' | 'today' | 'tomorrow' | 'in3' | 'inWeek' | 'inMonth';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-task-edit-panel',
  templateUrl: './task-edit.modal.html',
  styleUrls: ['./task-edit.modal.scss'],
  standalone: false,
})
export class TaskEditModal implements OnChanges {
  @Input() open = false;
  @Input() task: Task | null = null;
  @Output() closed = new EventEmitter<void>();

  name = '';
  remindMe = true;
  selected: DeadlineKey = 'keep';
  prefs!: UserPrefs;
  now = Date.now();

  constructor(private alertCtrl: AlertController, private tasks: TaskService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open && this.task) {
      this.prefs = this.tasks.currentPrefs;
      this.now = Date.now();
      this.name = this.task.name;
      this.remindMe = this.task.remindMe;
      this.selected = 'keep';
    }
  }

  get todayDisabled(): boolean {
    if (!this.prefs) return false;
    return new Date(this.now).getHours() >= this.prefs.operatingWindowEndHour;
  }

  get canSubmit(): boolean {
    return this.name.trim().length > 0;
  }

  get currentDeadlineLabel(): string {
    if (!this.task) return '';
    return new Date(this.task.deadline).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  private deadlineFor(key: DeadlineKey): number {
    if (key === 'keep') return this.task!.deadline;
    const base = new Date(this.now);
    base.setHours(0, 0, 0, 0);
    switch (key) {
      case 'today': return base.getTime();
      case 'tomorrow': return base.getTime() + DAY_MS;
      case 'in3': return base.getTime() + 3 * DAY_MS;
      case 'inWeek': return base.getTime() + 7 * DAY_MS;
      case 'inMonth': return base.getTime() + 30 * DAY_MS;
    }
  }

  select(key: DeadlineKey) {
    if (key === 'today' && this.todayDisabled) return;
    this.selected = key;
  }

  close() {
    this.closed.emit();
  }

  async submit() {
    if (!this.canSubmit || !this.task) return;
    await this.tasks.edit(this.task.id, {
      name: this.name.trim(),
      deadline: this.deadlineFor(this.selected),
      remindMe: this.remindMe,
    });
    this.close();
  }

  async confirmDelete() {
    if (!this.task) return;
    const id = this.task.id;
    const taskName = this.task.name;
    const alert = await this.alertCtrl.create({
      header: 'Delete task?',
      message: `"${taskName}" will be removed.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Delete',
          role: 'destructive',
          handler: async () => {
            await this.tasks.delete(id);
            this.close();
          },
        },
      ],
    });
    await alert.present();
  }
}
