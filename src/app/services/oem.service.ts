import { Injectable } from '@angular/core';
import { Device } from '@capacitor/device';
import { UserPrefs } from '../models/task';

type OemRiskTier = UserPrefs['oemRiskTier'];

// Known-aggressive Android OEMs. Source: dontkillmyapp.com benchmarks + POC §5.5.
const RISK_TABLE: Record<string, OemRiskTier> = {
  google: 'none',
  motorola: 'none',
  nokia: 'none',
  samsung: 'moderate',
  sony: 'moderate',
  oneplus: 'high',
  oppo: 'high',
  realme: 'high',
  vivo: 'high',
  xiaomi: 'brutal',
  redmi: 'brutal',
  huawei: 'brutal',
  honor: 'brutal',
};

@Injectable({ providedIn: 'root' })
export class OemService {
  private cachedManufacturer: string | null = null;

  async getManufacturer(): Promise<string> {
    if (this.cachedManufacturer !== null) {
      return this.cachedManufacturer;
    }
    const info = await Device.getInfo();
    this.cachedManufacturer = info.manufacturer ?? '';
    return this.cachedManufacturer;
  }

  async getOEMRiskTier(): Promise<OemRiskTier> {
    const key = (await this.getManufacturer()).toLowerCase();
    return RISK_TABLE[key] ?? 'none';
  }
}
