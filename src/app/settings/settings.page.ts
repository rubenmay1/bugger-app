import { Component, OnInit } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { HealthService, HealthState } from '../services/health.service';
import { TaskService } from '../services/task.service';
import { OemService } from '../services/oem.service';
import { Task, UserPrefs } from '../models/task';
import { notificationIdFor } from '../services/scheduling-math';

type OemRiskTier = UserPrefs['oemRiskTier'];
type AlarmSyncState = 'unregistered' | 'time-mismatch' | 'synced';

interface AlarmEntry {
  task: Task;
  nextAlarmAt: number | null;
  expectedId: number | null;
  syncState: AlarmSyncState | null;
}

const OEM_TIER_COPY: Record<OemRiskTier, { headline: string; advice: string }> = {
  none: {
    headline: 'Should work out of the box.',
    advice: 'Stock Android behaviour. No extra steps needed.',
  },
  moderate: {
    headline: 'Mostly fine, with occasional misses.',
    advice: 'If reminders ever go quiet, disable battery optimisation for this app.',
  },
  high: {
    headline: 'Likely to suppress reminders.',
    advice: 'Open phone Settings -> Battery -> find this app -> set to "No restrictions" / "Unrestricted". Also enable Autostart if your phone has that toggle.',
  },
  brutal: {
    headline: 'Will aggressively suppress reminders.',
    advice: 'Open phone Settings -> Battery -> set this app to "No restrictions". Enable Autostart. Lock the app in Recents (slide down and tap the lock icon). If reminders still miss, check dontkillmyapp.com for brand-specific steps.',
  },
  unsupported: {
    headline: 'Unknown manufacturer.',
    advice: 'We don\'t have data for this device. If reminders miss, look up your phone brand on dontkillmyapp.com.',
  },
};

function pendingAtMs(at: Date | string | undefined | null): number | null {
  if (at == null) {
    return null;
  }
  const ms = new Date(at as any).getTime();
  return isNaN(ms) ? null : ms;
}

function worstOfStates(states: AlarmSyncState[]): AlarmSyncState | null {
  if (states.includes('unregistered')) {
    return 'unregistered';
  }
  if (states.includes('time-mismatch')) {
    return 'time-mismatch';
  }
  if (states.includes('synced')) {
    return 'synced';
  }
  return null;
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
  scheduleErrorAt: number | null = null;
  forcing = false;

  alarmsOpen = false;
  alarms: AlarmEntry[] = [];
  alarmsLoading = false;
  alarmsWorstState: AlarmSyncState | null = null;

  healthOpen = false;

  oemOpen = false;
  oemManufacturer = '';

  constructor(
    private tasks: TaskService,
    private healthService: HealthService,
    private oem: OemService,
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
    if (this.healthService.openHealthOnEnter) {
      this.healthService.openHealthOnEnter = false;
      this.healthOpen = true;
    }
  }

  async refreshHealth() {
    [this.lastPingAt, this.pingHistory, this.scheduleErrorAt] = await Promise.all([
      this.healthService.getLastPingAt(),
      this.healthService.getPingHistory().then(h => h.slice(0, 5)),
      this.healthService.getScheduleErrorAt(),
    ]);
    this.health = this.healthService.stateFor(this.lastPingAt);
  }

  get lastPingLabel(): string {
    if (this.lastPingAt === null) {
      return 'Never';
    }
    const ageMin = Math.round((Date.now() - this.lastPingAt) / 60_000);
    if (ageMin < 1) {
      return 'Just now';
    }
    if (ageMin < 60) {
      return `${ageMin}m ago`;
    }
    return `${Math.round(ageMin / 60)}h ago`;
  }

  pingLabel(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  async savePrefs() {
    const start = Math.max(0, Math.min(22, Math.floor(this.prefs.operatingWindowStartHour)));
    let end = Math.max(1, Math.min(23, Math.floor(this.prefs.operatingWindowEndHour)));
    if (end <= start) {
      end = Math.min(23, start + 1);
    }
    this.prefs = { ...this.prefs, operatingWindowStartHour: start, operatingWindowEndHour: end };
    await this.tasks.updatePrefs(this.prefs);
    await this.tasks.rescheduleAll();
    await this.refreshAlarmsDrift();
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
      await this.healthService.dispatchVerifier();
      await this.tasks.selfTest();
      await this.healthService.stampHeartbeat();
      await this.refreshHealth();
    } catch (_) {
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

  get oemHeadline(): string {
    return OEM_TIER_COPY[this.oemTier].headline;
  }

  get oemAdvice(): string {
    return OEM_TIER_COPY[this.oemTier].advice;
  }

  get oemHealthState(): HealthState {
    if (this.oemTier === 'none' || this.oemTier === 'unsupported') {
      return 'green';
    }
    if (this.oemTier === 'moderate') {
      return 'amber';
    }
    return 'red';
  }

  openOem() { this.oemOpen = true; }
  closeOem() { this.oemOpen = false; }

  async openAlarms() {
    this.alarmsOpen = true;
    await this.loadAlarms();
  }

  closeAlarms() {
    this.alarmsOpen = false;
  }

  async refreshAlarmsDrift() {
    const remindingTasks = this.tasks.currentActive.filter(
      t => t.remindMe && t.sequenceNumber > 0 && t.nextAlarmAt !== undefined,
    );
    if (Capacitor.getPlatform() !== 'android') {
      this.alarmsWorstState = remindingTasks.length > 0 ? 'unregistered' : null;
      return;
    }
    try {
      const pendingTimes = await this.fetchPendingTimes();
      const states = remindingTasks.map<AlarmSyncState>(t => {
        const id = notificationIdFor(t.id, t.sequenceNumber);
        if (!pendingTimes.has(id)) {
          return 'unregistered';
        }
        return pendingTimes.get(id) === t.nextAlarmAt ? 'synced' : 'time-mismatch';
      });
      this.alarmsWorstState = worstOfStates(states);
    } catch (_) {
      this.alarmsWorstState = remindingTasks.length > 0 ? 'unregistered' : null;
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
    this.alarmsWorstState = null;
    try {
      const isAndroid = Capacitor.getPlatform() === 'android';
      const pendingTimes = isAndroid ? await this.fetchPendingTimes() : new Map<number, number | null>();

      this.alarms = this.tasks.currentActive
        .filter(t => t.remindMe)
        .map<AlarmEntry>(t => {
          const expectedId =
            t.sequenceNumber > 0 && t.nextAlarmAt !== undefined
              ? notificationIdFor(t.id, t.sequenceNumber)
              : null;
          let syncState: AlarmSyncState | null = null;
          if (expectedId !== null) {
            if (!isAndroid || !pendingTimes.has(expectedId)) {
              syncState = 'unregistered';
            } else {
              syncState = pendingTimes.get(expectedId) === t.nextAlarmAt ? 'synced' : 'time-mismatch';
            }
          }
          return { task: t, nextAlarmAt: t.nextAlarmAt ?? null, expectedId, syncState };
        })
        .sort((a, b) => (a.nextAlarmAt ?? Infinity) - (b.nextAlarmAt ?? Infinity));

      const definiteStates = this.alarms
        .map(a => a.syncState)
        .filter((s): s is AlarmSyncState => s !== null);
      this.alarmsWorstState = worstOfStates(definiteStates);
    } finally {
      this.alarmsLoading = false;
    }
  }

  private async fetchPendingTimes(): Promise<Map<number, number | null>> {
    try {
      const pending = await LocalNotifications.getPending();
      return new Map(pending.notifications.map(n => [n.id, pendingAtMs(n.schedule?.at)]));
    } catch (_) {
      return new Map();
    }
  }

  alarmTimeLabel(entry: AlarmEntry): string {
    if (entry.nextAlarmAt === null) {
      return 'No alarm scheduled';
    }
    return `Next alarm: ${new Date(entry.nextAlarmAt).toLocaleString()}`;
  }
}
