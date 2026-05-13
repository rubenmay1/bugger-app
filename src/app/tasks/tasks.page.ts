import { Component, HostListener, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, timer } from 'rxjs';
import { IonItemSliding } from '@ionic/angular';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { ProximityTier, Task, UserPrefs } from '../models/task';
import { TaskService } from '../services/task.service';
import { HealthService } from '../services/health.service';
import { computeTier, effectiveDeadline } from '../services/scheduling-math';
import { formatDuration } from '../shared/format';

interface TaskGroup {
  tier: ProximityTier;
  tasks: Task[];
}

@Component({
  selector: 'app-tasks',
  templateUrl: './tasks.page.html',
  styleUrls: ['./tasks.page.scss'],
  standalone: false,
})
export class TasksPage implements OnInit {
  groups$!: Observable<TaskGroup[]>;
  showStaleBanner = false;
  bannerDismissed = false;

  createOpen = false;
  editOpen = false;
  editTask: Task | null = null;
  actionTask: Task | null = null;

  private readonly query$ = new BehaviorSubject<string>('');
  searchQuery = '';

  private activeSlider: IonItemSliding | null = null;
  private activeSliderEl: HTMLElement | null = null;
  private activeRatio = 0;
  private activeLocked = false;
  private swipeInProgress = false;

  constructor(
    public tasks: TaskService,
    private health: HealthService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.groups$ = combineLatest([
      this.tasks.active$,
      this.tasks.prefs$,
      this.query$,
      timer(0, 60_000),
    ]).pipe(
      map(([tasks, prefs, q]) => {
        const filtered = q.trim() ? tasks.filter(t => t.name.toLowerCase().includes(q.toLowerCase())) : tasks;
        return this.group(filtered, prefs);
      }),
    );
  }

  onSearchInput(ev: Event) {
    const value = (ev as CustomEvent).detail?.value ?? '';
    this.searchQuery = value;
    this.query$.next(value);
  }

  onSlide(ev: CustomEvent, slider: IonItemSliding) {
    this.activeSlider = slider;
    this.activeSliderEl = (ev.currentTarget ?? ev.target) as HTMLElement;
    const detail: any = ev.detail;
    const raw = typeof detail === 'number' ? detail : (detail?.ratio ?? 0);
    const ratio = Math.abs(raw);
    this.activeRatio = ratio;

    const lerp = Math.min(1, ratio);
    const r = Math.round(30 + (34 - 30) * lerp);
    const g = Math.round(30 + (197 - 30) * lerp);
    const b = Math.round(30 + (94 - 30) * lerp);
    this.activeSliderEl.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    const nowLocked = ratio >= 1.0;
    if (nowLocked !== this.activeLocked) {
      const icon = this.activeSliderEl.querySelector('ion-item-option ion-icon') as HTMLElement | null;
      if (icon) {
        icon.classList.toggle('locked', nowLocked);
      }
      this.activeLocked = nowLocked;
    }
  }

  onSwipe() {
    this.swipeInProgress = true;
  }

  @HostListener('document:pointerup')
  @HostListener('document:touchend')
  async onPointerRelease() {
    const slider = this.activeSlider;
    const sliderEl = this.activeSliderEl;
    const ratio = this.activeRatio;
    const swiped = this.swipeInProgress;
    this.activeSlider = null;
    this.activeSliderEl = null;
    this.activeRatio = 0;
    this.activeLocked = false;
    this.swipeInProgress = false;
    if (!slider || ratio === 0) {
      return;
    }
    if (sliderEl) {
      sliderEl.style.backgroundColor = '';
      const icon = sliderEl.querySelector('ion-item-option ion-icon') as HTMLElement | null;
      if (icon) {
        icon.classList.remove('locked');
      }
    }
    if (swiped) {
      return;
    }
    await slider.close();
  }

  async ionViewWillEnter() {
    this.bannerDismissed = false;
    await this.refreshBanner();
  }

  private async refreshBanner() {
    if (Capacitor.getPlatform() !== 'android') {
      this.showStaleBanner = false;
      return;
    }
    const state = await this.health.getState();
    this.showStaleBanner = state === 'red';
  }

  dismissBanner() { this.bannerDismissed = true; }
  openHealth() {
    this.health.openHealthOnEnter = true;
    this.router.navigateByUrl('/settings');
  }

  private group(tasks: Task[], prefs: UserPrefs): TaskGroup[] {
    const now = Date.now();
    const tiers = Object.values(ProximityTier);
    const buckets = {} as Record<ProximityTier, Task[]>;
    for (const tier of tiers) {
      buckets[tier] = [];
    }
    for (const t of tasks) {
      buckets[computeTier(now, t, prefs)].push(t);
    }
    for (const tier of tiers) {
      buckets[tier].sort((a, b) => a.deadline - b.deadline || a.createdAt - b.createdAt);
    }
    return tiers
      .filter(tier => buckets[tier].length > 0)
      .map(tier => ({ tier, tasks: buckets[tier] }));
  }

  deadlineLabel(task: Task): string {
    const ms = effectiveDeadline(task, this.tasks.currentPrefs) - Date.now();
    const str = formatDuration(ms);
    return ms < 0 ? `${str} late` : `in ${str}`;
  }

  openCreate() { this.createOpen = true; }
  closeCreate() { this.createOpen = false; }

  openEdit(task: Task) {
    this.editTask = task;
    this.editOpen = true;
  }
  closeEdit() {
    this.editOpen = false;
    this.editTask = null;
  }

  openActions(task: Task) {
    this.actionTask = task;
  }
  closeActions() {
    this.actionTask = null;
  }
  actionComplete() {
    if (this.actionTask) {
      this.tasks.complete(this.actionTask.id);
    }
    this.closeActions();
  }

  actionEdit() {
    if (this.actionTask) {
      this.openEdit(this.actionTask);
    }
    this.closeActions();
  }

  actionDelete() {
    if (this.actionTask) {
      this.tasks.delete(this.actionTask.id);
    }
    this.closeActions();
  }

  trackId(_: number, t: Task) { return t.id; }
}
