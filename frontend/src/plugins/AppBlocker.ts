import { registerPlugin } from '@capacitor/core';

export type PermissionState = 'granted' | 'denied' | 'prompt';

export interface AppBlockerPermissions {
  usageStats: PermissionState;     // Android — PACKAGE_USAGE_STATS
  accessibility: PermissionState;  // Android — AccessibilityService enabled
  familyControls: PermissionState; // iOS    — FamilyControls authorization
}

export interface BlockEntry {
  value: string;
  label?: string;
}

export interface BlockingSchedule {
  enabled: boolean;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  days: number[];    // 0=Sun … 6=Sat
}

export interface BlockingRules {
  isEnabled: boolean;
  blockedApps: BlockEntry[];
  blockedSites: BlockEntry[];
  whitelist: BlockEntry[];
  schedule: BlockingSchedule;
}

export interface BlockingState {
  active: boolean;
  snoozed: boolean;
  snoozeUntil?: number; // epoch ms
}

export interface AppBlockerPlugin {
  checkPermissions(): Promise<AppBlockerPermissions>;
  requestPermissions(): Promise<void>;
  requestFamilyControlsAuth(): Promise<{ authorized: boolean }>;
  setBlockingRules(options: { rules: BlockingRules }): Promise<{ ok: boolean }>;
  getBlockingState(): Promise<BlockingState>;
  startBlocking(): Promise<{ ok: boolean }>;
  stopBlocking(): Promise<{ ok: boolean }>;
  snooze(options: { minutes: number }): Promise<{ ok: boolean }>;
}

const AppBlocker = registerPlugin<AppBlockerPlugin>('AppBlocker', {
  web: () => import('./AppBlockerWeb').then((m) => new m.AppBlockerWeb()),
});

export { AppBlocker };
