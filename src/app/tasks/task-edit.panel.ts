import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Task, UserPrefs } from '../models/task';
import { TaskService } from '../services/task.service';
import { DEADLINE_OPTIONS, DeadlineKey, computeDeadline } from './deadline-options';

type EditDeadlineKey = 'keep' | DeadlineKey;

@Component({
  selector: 'app-task-edit-panel',
  templateUrl: './task-edit.panel.html',
  styleUrls: ['./task-edit.panel.scss'],
  standalone: false,
})
export class TaskEditPanel implements OnChanges {
  @Input() open = false;
  @Input() task: Task | null = null;
  @Output() closed = new EventEmitter<void>();

  readonly options = DEADLINE_OPTIONS;

  name = '';
  remindMe = true;
  selected: EditDeadlineKey = 'keep';
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
    if (!this.prefs) {
      return false;
    }
    return new Date(this.now).getHours() >= this.prefs.operatingWindowEndHour;
  }

  get canSubmit(): boolean {
    return this.name.trim().length > 0;
  }

  get currentDeadlineLabel(): string {
    if (!this.task) {
      return '';
    }
    return new Date(this.task.deadline).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }

  private deadlineFor(key: EditDeadlineKey): number {
    if (key === 'keep') {
      return this.task!.deadline;
    }
    return computeDeadline(key, this.now);
  }

  select(key: EditDeadlineKey) {
    if (key === 'today' && this.todayDisabled) {
      return;
    }
    this.selected = key;
  }

  close() {
    this.closed.emit();
  }

  async submit() {
    if (!this.canSubmit || !this.task) {
      return;
    }
    await this.tasks.edit(this.task.id, {
      name: this.name.trim(),
      deadline: this.deadlineFor(this.selected),
      remindMe: this.remindMe,
    });
    this.close();
  }

  async confirmDelete() {
    if (!this.task) {
      return;
    }
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
