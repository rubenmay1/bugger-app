import { Component, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HealthService, HealthState } from '../services/health.service';
import { TaskService } from '../services/task.service';
import { OemService } from '../services/oem.service';
import { HYDRA_CHANNEL_ID, SchedulerService } from '../services/scheduler.service';
import { Task, UserPrefs } from '../models/task';
import { notificationIdFor } from '../services/scheduling-math';

const OEM_TIER_COPY: Record<UserPrefs['oemRiskTier'], { headline: string; advice: string }> = {
  none:        { headline: 'Should work out of the box.',
                 advice: 'Stock Android behaviour. No extra steps needed.' },
  moderate:    { headline: 'Mostly fine, with occasional misses.',
                 advice: 'If reminders ever go quiet, disable battery optimisation for this app.' },
  high:        { headline: 'Likely to suppress reminders.',
                 advice: 'Open phone Settings → Battery → find this app → set to "No restrictions" / "Unrestricted". Also enable Autostart if your phone has that toggle.' },
  brutal:      { headline: 'Will aggressively suppress reminders.',
                 advice: 'Open phone Settings → Battery → set this app to "No restrictions". Enable Autostart. Lock the app in Recents (slide down and tap the lock icon). If reminders still miss, check dontkillmyapp.com for brand-specific steps.' },
  unsupported: { headline: 'Unknown manufacturer.',
                 advice: 'We don\'t have data for this device. If reminders miss, look up your phone brand on dontkillmyapp.com.' },
};

type OemRiskTier = UserPrefs['oemRiskTier'];

interface AlarmEntry {
  task: Task;
  nextAlarmAt: number | null;
  expectedId: number | null;
  synced: boolean;
}

@Component({
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: false,
})
export class SettingsPage implements OnInit {
  prefs!: UserPrefs;
  lastPingAt: number | null = null;
  pingHistory: number[] = [];
  health: HealthState = 'red';
  forcing = false;

  alarmsOpen = false;
  alarms: AlarmEntry[] = [];
  alarmsLoading = false;
  alarmsHaveDrift = false;

  previewOpen = false;
  readonly previewSampleTask = 'Pay the gas bill';
  get previewTimeLabel(): string {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  healthOpen = false;

  oemOpen = false;
  oemManufacturer = '';

  constructor(
    private tasks: TaskService,
    private health$: HealthService,
    private oem: OemService,
    private scheduler: SchedulerService,
    private toastCtrl: ToastController,
  ) {}

  async ngOnInit() {
    this.prefs = { ...this.tasks.currentPrefs };
    this.oemManufacturer = await this.oem.getManufacturer();
    await this.refreshHealth();
  }

  async ionViewWillEnter() {
    this.prefs = { ...this.tasks.currentPrefs };
    await this.refreshHealth();
    await this.refreshAlarmsDrift();
    if (this.health$.openHealthOnEnter) {
      this.health$.openHealthOnEnter = false;
      this.healthOpen = true;
    }
  }

  async refreshHealth() {
    this.lastPingAt = await this.health$.getLastPingAt();
    this.pingHistory = (await this.health$.getPingHistory()).slice(0, 8);
    this.health = this.health$.stateFor(this.lastPingAt);
  }

  get lastPingLabel(): string {
    if (this.lastPingAt === null) return 'Never';
    const ageMin = Math.round((Date.now() - this.lastPingAt) / 60000);
    if (ageMin < 1) return 'Just now';
    if (ageMin < 60) return `${ageMin}m ago`;
    return `${Math.round(ageMin / 60)}h ago`;
  }

  pingLabel(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  async savePrefs() {
    const start = Math.max(0, Math.min(22, Math.floor(this.prefs.operatingWindowStartHour)));
    let end = Math.max(1, Math.min(23, Math.floor(this.prefs.operatingWindowEndHour)));
    if (end <= start) end = Math.min(23, start + 1);
    this.prefs = { ...this.prefs, operatingWindowStartHour: start, operatingWindowEndHour: end };
    await this.tasks.updatePrefs(this.prefs);
  }

  formatHour(h: number): string {
    const hh = ((h % 24) + 24) % 24;
    return hh.toString().padStart(2, '0') + ':00';
  }

  onRangeStartInput(ev: Event) {
    const v = +(ev.target as HTMLInputElement).value;
    this.prefs.operatingWindowStartHour = Math.min(v, this.prefs.operatingWindowEndHour - 1);
    this.savePrefs();
  }
  onRangeEndInput(ev: Event) {
    const v = +(ev.target as HTMLInputElement).value;
    this.prefs.operatingWindowEndHour = Math.max(v, this.prefs.operatingWindowStartHour + 1);
    this.savePrefs();
  }

  get rangeFillStyle(): { left: string; right: string } {
    const left = (this.prefs.operatingWindowStartHour / 23) * 100;
    const right = 100 - (this.prefs.operatingWindowEndHour / 23) * 100;
    return { left: `${left}%`, right: `${right}%` };
  }

  async forceCheck() {
    this.forcing = true;
    try {
      await this.health$.dispatchVerifier();
      await this.tasks.selfTest();
      await this.health$.stampHeartbeat();
      await this.refreshHealth();
    } catch (err) {
      const toast = await this.toastCtrl.create({ message: 'Check failed', duration: 2000, position: 'bottom' });
      await toast.present();
    } finally {
      this.forcing = false;
    }
  }

  get oemTier(): OemRiskTier {
    return this.tasks.currentPrefs.oemRiskTier;
  }

  get oemTierLabel(): string {
    return this.oemTier.charAt(0).toUpperCase() + this.oemTier.slice(1);
  }

  get oemHeadline(): string { return OEM_TIER_COPY[this.oemTier].headline; }
  get oemAdvice(): string  { return OEM_TIER_COPY[this.oemTier].advice; }

  // Map OEM risk tier to a health colour so the row indicator on Settings
  // matches the language of Health Check (green = safe, red = at risk).
  get oemHealthState(): HealthState {
    if (this.oemTier === 'none' || this.oemTier === 'unsupported') return 'green';
    if (this.oemTier === 'moderate') return 'amber';
    return 'red';
  }

  openOem() { this.oemOpen = true; }
  closeOem() { this.oemOpen = false; }

  async sendTestNotification() {
    if (Capacitor.getPlatform() === 'android') {
      try {
        // Same shape as a real Hydra ping: register actions + channel up front
        // so the "Mark as Completed" button shows on the test notification.
        await this.scheduler.registerActions();
        await this.scheduler.ensureChannel();
        await LocalNotifications.schedule({
          notifications: [{
            id: 9_999_999,
            title: 'Bugger',
            body: this.previewSampleTask,
            schedule: { at: new Date(Date.now() + 1500), allowWhileIdle: true },
            actionTypeId: 'TASK_ACTIONS',
            channelId: HYDRA_CHANNEL_ID,
          }],
        });
      } catch (err) {
        console.warn('Test notification failed', err);
      }
      return;
    }
    // Web: show an in-app Android-style preview. OS-level notifications are
    // unreliable here (Windows aggressively suppresses Firefox notifications),
    // so we render our own mock instead.
    this.previewOpen = true;
  }

  closePreview() {
    this.previewOpen = false;
  }

  previewComplete() {
    this.previewOpen = false;
  }

  async openAlarms() {
    this.alarmsOpen = true;
    await this.loadAlarms();
  }
  closeAlarms() {
    this.alarmsOpen = false;
  }

  // Lightweight check answering "is any reminder not synced to the phone?".
  // On web nothing is ever truly synced — if any task has a reminder pending,
  // we flag drift so the row matches what the popup shows.
  async refreshAlarmsDrift() {
    const remindingTasks = this.tasks.currentActive.filter(
      t => t.remindMe && t.sequenceNumber > 0 && t.nextAlarmAt !== undefined,
    );
    if (Capacitor.getPlatform() !== 'android') {
      this.alarmsHaveDrift = remindingTasks.length > 0;
      return;
    }
    try {
      const pending = await LocalNotifications.getPending();
      const pendingIds = new Set(pending.notifications.map(n => n.id));
      this.alarmsHaveDrift = remindingTasks.some(
        t => !pendingIds.has(notificationIdFor(t.id, t.sequenceNumber)),
      );
    } catch (_) {
      this.alarmsHaveDrift = remindingTasks.length > 0;
    }
  }

  async openHealth() {
    this.healthOpen = true;
    await this.refreshHealth();
  }
  closeHealth() {
    this.healthOpen = false;
  }

  async loadAlarms() {
    this.alarmsLoading = true;
    this.alarmsHaveDrift = false;
    try {
      // "Synced to phone" only means anything on Android — that's where the OS
      // actually holds the alarm. The web plugin shim has its own setTimeout
      // queue and will happily report a fake "pending" match, which would
      // mislead the user.
      const isAndroid = Capacitor.getPlatform() === 'android';
      let pendingIds = new Set<number>();
      if (isAndroid) {
        try {
          const pending = await LocalNotifications.getPending();
          pendingIds = new Set(pending.notifications.map(n => n.id));
        } catch (_) { /* ignore */ }
      }

      this.alarms = this.tasks.currentActive
        .filter(t => t.remindMe)
        .map<AlarmEntry>(t => {
          const expectedId =
            t.sequenceNumber > 0 && t.nextAlarmAt !== undefined
              ? notificationIdFor(t.id, t.sequenceNumber)
              : null;
          return {
            task: t,
            nextAlarmAt: t.nextAlarmAt ?? null,
            expectedId,
            synced: isAndroid && expectedId !== null && pendingIds.has(expectedId),
          };
        })
        .sort((a, b) => (a.nextAlarmAt ?? Infinity) - (b.nextAlarmAt ?? Infinity));
      this.alarmsHaveDrift = this.alarms.some(a => a.expectedId !== null && !a.synced);
    } finally {
      this.alarmsLoading = false;
    }
  }

  alarmTimeLabel(entry: AlarmEntry): string {
    if (entry.nextAlarmAt === null) return 'No alarm scheduled';
    return new Date(entry.nextAlarmAt).toLocaleString();
  }
}
