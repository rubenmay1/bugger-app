import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { Task } from '../models/task';
import { TaskService } from '../services/task.service';
import { effectiveDeadline } from '../services/scheduling-math';
import { formatDuration } from '../shared/format';

interface HistoryEntry {
  task: Task;
  completedAtLabel: string;
  performanceLabel: string;
  late: boolean;
}

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false,
})
export class HistoryPage implements OnInit {
  entries$!: Observable<HistoryEntry[]>;
  searchQuery = '';
  private readonly query$ = new BehaviorSubject<string>('');

  constructor(private tasks: TaskService) {}

  ngOnInit() {
    this.entries$ = combineLatest([this.tasks.completed$, this.query$]).pipe(
      map(([tasks, q]) => {
        const filtered = q.trim()
          ? tasks.filter(t => t.name.toLowerCase().includes(q.toLowerCase()))
          : tasks;
        return [...filtered]
          .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
          .map(t => this.toEntry(t));
      }),
    );
  }

  onSearchInput(ev: Event) {
    const value = (ev as CustomEvent).detail?.value ?? '';
    this.searchQuery = value;
    this.query$.next(value);
  }

  private toEntry(task: Task): HistoryEntry {
    const eff = effectiveDeadline(task, this.tasks.currentPrefs);
    const completedAt = task.completedAt ?? eff;
    const delta = eff - completedAt;
    const str = formatDuration(delta);
    return {
      task,
      completedAtLabel: new Date(completedAt).toLocaleString(),
      performanceLabel: delta < 0 ? `${str} late` : `${str} early`,
      late: delta < 0,
    };
  }

  trackId(_: number, e: HistoryEntry) { return e.task.id; }
}
