import { Injectable } from '@angular/core';
import { BackgroundRunner } from '@capacitor/background-runner';
import { KvService } from './kv.service';
import { KV_KEYS } from '../models/task';

export type HealthState = 'green' | 'amber' | 'red';

export const AMBER_THRESHOLD_MS = 30 * 60 * 1000;
export const RED_THRESHOLD_MS = 2 * 60 * 60 * 1000;

@Injectable({ providedIn: 'root' })
export class HealthService {
  constructor(private kv: KvService) {}

  async getLastPingAt(): Promise<number | null> {
    return this.kv.get<number>(KV_KEYS.lastPingAt);
  }

  async getPingHistory(): Promise<number[]> {
    return (await this.kv.get<number[]>(KV_KEYS.pingHistory)) ?? [];
  }

  stateFor(lastPingAt: number | null, now: number = Date.now()): HealthState {
    if (lastPingAt === null) return 'red';
    const age = now - lastPingAt;
    if (age < AMBER_THRESHOLD_MS) return 'green';
    if (age < RED_THRESHOLD_MS) return 'amber';
    return 'red';
  }

  async getState(now: number = Date.now()): Promise<HealthState> {
    return this.stateFor(await this.getLastPingAt(), now);
  }

  async forceCheck(): Promise<void> {
    await BackgroundRunner.dispatchEvent({
      label: 'app.bugger.verifier',
      event: 'verify',
      details: {},
    });
  }
}
