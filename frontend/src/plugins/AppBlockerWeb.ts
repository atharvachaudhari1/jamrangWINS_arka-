import { WebPlugin } from '@capacitor/core';
import type {
  AppBlockerPlugin,
  AppBlockerPermissions,
  BlockingRules,
  BlockingState,
} from './AppBlocker';

export class AppBlockerWeb extends WebPlugin implements AppBlockerPlugin {
  async checkPermissions(): Promise<AppBlockerPermissions> {
    return { usageStats: 'denied', accessibility: 'denied', familyControls: 'denied' };
  }
  async requestPermissions(): Promise<void> {}
  async requestFamilyControlsAuth(): Promise<{ authorized: boolean }> {
    return { authorized: false };
  }
  async setBlockingRules(_: { rules: BlockingRules }): Promise<{ ok: boolean }> {
    return { ok: false };
  }
  async getBlockingState(): Promise<BlockingState> {
    return { active: false, snoozed: false };
  }
  async startBlocking(): Promise<{ ok: boolean }> { return { ok: false }; }
  async stopBlocking(): Promise<{ ok: boolean }> { return { ok: false }; }
  async snooze(_: { minutes: number }): Promise<{ ok: boolean }> { return { ok: false }; }
}
