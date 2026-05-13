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
import { DEADLINE_OPTIONS, DeadlineKey, computeDeadline } from './deadline-options';

@Component({
  selector: 'app-task-create-panel',
  templateUrl: './task-create.panel.html',
  styleUrls: ['./task-create.panel.scss'],
  standalone: false,
})
export class TaskCreatePanel implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  readonly options = DEADLINE_OPTIONS;

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
    if (this.open) {
      setTimeout(() => this.nameInput?.nativeElement.focus(), 80);
    }
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

  select(key: DeadlineKey) {
    if (key === 'today' && this.todayDisabled) {
      return;
    }
    this.selected = key;
  }

  close() {
    this.closed.emit();
  }

  async submit() {
    if (!this.canSubmit) {
      return;
    }
    await this.tasks.create({
      name: this.name.trim(),
      deadline: computeDeadline(this.selected, this.now),
      remindMe: this.remindMe,
    });
    this.close();
  }
}
