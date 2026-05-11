import { Component, HostListener, OnInit } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest, map, timer } from 'rxjs';
import { IonItemSliding, NavController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { ProximityTier, Task, UserPrefs } from '../models/task';
import { TaskService } from '../services/task.service';
import { HealthService } from '../services/health.service';
import { computeTier, effectiveDeadline } from '../services/scheduling-math';
// computeTier now takes (now, task, prefs).

interface TaskGroup {
  tier: ProximityTier;
  label: string;
  tasks: Task[];
}

const TIER_ORDER: ProximityTier[] = ['expired', 'urgent', 'near', 'distant'];
const TIER_LABELS: Record<ProximityTier, string> = {
  expired: 'Expired',
  urgent: 'Urgent',
  near: 'This week',
  distant: 'Later',
};

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

  // Sliders never rest in the "open" position. Any release before the swipe
  // trigger (ratio >= 1) snaps the row back to start; only a full swipe past
  // the option width fires (ionSwipe) → complete.
  private activeSlider: IonItemSliding | null = null;
  private activeSliderEl: HTMLElement | null = null;
  private activeRatio = 0;
  private activeLocked = false;

  constructor(
    public tasks: TaskService,
    private health: HealthService,
    private nav: NavController,
  ) {}

  ngOnInit() {
    // Re-tier on any of: task list change, prefs change (operating window
    // shifts the effective cutoff), a 60s tick (so tasks flip to "expired"
    // as their cutoff passes while the user sits on this tab), or a search
    // query change.
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

    // Background lerp: surface-1 (30,30,30) → primary (34,197,94) as ratio
    // ramps 0 → 1. Capped at 1 so over-drag stays full green.
    const lerp = Math.min(1, ratio);
    const r = Math.round(30 + (34 - 30) * lerp);
    const g = Math.round(30 + (197 - 30) * lerp);
    const b = Math.round(30 + (94 - 30) * lerp);
    this.activeSliderEl.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;

    // Tick: pops in when the action locks (ratio >= 1), pops out if user
    // drags back below the threshold.
    const nowLocked = ratio >= 1.0;
    if (nowLocked !== this.activeLocked) {
      const icon = this.activeSliderEl.querySelector('ion-item-option ion-icon') as HTMLElement | null;
      if (icon) icon.classList.toggle('locked', nowLocked);
      this.activeLocked = nowLocked;
    }
  }

  @HostListener('document:pointerup')
  @HostListener('document:touchend')
  async onPointerRelease() {
    const slider = this.activeSlider;
    const sliderEl = this.activeSliderEl;
    const ratio = this.activeRatio;
    this.activeSlider = null;
    this.activeSliderEl = null;
    this.activeRatio = 0;
    this.activeLocked = false;
    if (!slider || ratio === 0) return;
    if (ratio >= 1.0) return; // ionSwipe will finish the action.
    if (sliderEl) {
      sliderEl.style.backgroundColor = '';
      const icon = sliderEl.querySelector('ion-item-option ion-icon') as HTMLElement | null;
      if (icon) icon.classList.remove('locked');
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
    this.nav.navigateRoot('/tabs/settings', { queryParams: { openHealth: 1 } });
  }

  private group(tasks: Task[], prefs: UserPrefs): TaskGroup[] {
    const now = Date.now();
    const buckets: Record<ProximityTier, Task[]> = { expired: [], urgent: [], near: [], distant: [] };
    for (const t of tasks) buckets[computeTier(now, t, prefs)].push(t);
    for (const tier of TIER_ORDER) {
      buckets[tier].sort((a, b) => a.deadline - b.deadline || a.createdAt - b.createdAt);
    }
    return TIER_ORDER
      .filter(tier => buckets[tier].length > 0)
      .map(tier => ({ tier, label: TIER_LABELS[tier], tasks: buckets[tier] }));
  }

  deadlineLabel(task: Task): string {
    const eff = effectiveDeadline(task, this.tasks.currentPrefs);
    const ms = eff - Date.now();
    const abs = Math.abs(ms);
    const day = 24 * 60 * 60 * 1000;
    const hour = 60 * 60 * 1000;
    const past = ms < 0;
    let str: string;
    if (abs < hour) str = `${Math.round(abs / 60000)}m`;
    else if (abs < day) str = `${Math.round(abs / hour)}h`;
    else str = `${Math.round(abs / day)}d`;
    return past ? `${str} late` : `in ${str}`;
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
    if (this.actionTask) this.tasks.complete(this.actionTask.id);
    this.closeActions();
  }
  actionEdit() {
    if (this.actionTask) this.openEdit(this.actionTask);
    this.closeActions();
  }
  actionDelete() {
    if (this.actionTask) this.tasks.delete(this.actionTask.id);
    this.closeActions();
  }

  trackId(_: number, t: Task) { return t.id; }
}
