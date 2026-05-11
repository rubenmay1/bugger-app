import { Component, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map } from 'rxjs';
import { Task } from '../models/task';
import { TaskService } from '../services/task.service';
import { effectiveDeadline } from '../services/scheduling-math';

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
    const late = delta < 0;
    return {
      task,
      completedAtLabel: new Date(completedAt).toLocaleString(),
      performanceLabel: this.formatDelta(delta),
      late,
    };
  }

  private formatDelta(ms: number): string {
    const abs = Math.abs(ms);
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    const min = 60 * 1000;
    let str: string;
    if (abs < min) str = '<1m';
    else if (abs < hour) str = `${Math.round(abs / min)}m`;
    else if (abs < day) str = `${Math.round(abs / hour)}h`;
    else str = `${Math.round(abs / day)}d`;
    return ms < 0 ? `${str} late` : `${str} early`;
  }

  trackId(_: number, e: HistoryEntry) { return e.task.id; }
}
