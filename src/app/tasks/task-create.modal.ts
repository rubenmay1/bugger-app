import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { TaskService } from '../services/task.service';
import { UserPrefs } from '../models/task';

type DeadlineKey = 'today' | 'tomorrow' | 'in3' | 'inWeek' | 'inMonth';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-task-create-panel',
  templateUrl: './task-create.modal.html',
  styleUrls: ['./task-create.modal.scss'],
  standalone: false,
})
export class TaskCreateModal implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  name = '';
  remindMe = true;
  selected: DeadlineKey = 'today';
  prefs!: UserPrefs;
  now = Date.now();

  constructor(private tasks: TaskService) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.reset();
      setTimeout(() => this.nameInput?.nativeElement.focus(), 80);
    }
  }

  ngAfterViewInit() {
    if (this.open) setTimeout(() => this.nameInput?.nativeElement.focus(), 80);
  }

  private reset() {
    this.name = '';
    this.remindMe = true;
    this.prefs = this.tasks.currentPrefs;
    this.now = Date.now();
    this.selected = this.todayDisabled ? 'tomorrow' : 'today';
  }

  get todayDisabled(): boolean {
    return new Date(this.now).getHours() >= this.prefs.operatingWindowEndHour;
  }

  get canSubmit(): boolean {
    return this.name.trim().length > 0;
  }

  private deadlineFor(key: DeadlineKey): number {
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
    if (!this.canSubmit) return;
    await this.tasks.create({
      name: this.name.trim(),
      deadline: this.deadlineFor(this.selected),
      remindMe: this.remindMe,
    });
    this.close();
  }
}
