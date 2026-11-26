import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

export interface AppSettings {
  startDate: string;
  heightCm: number;
  weeklyGoal: number;
  trainingWeekday: number; // 0 = lunedì
  lbPerBlock: number;
  lastBackupAt: number | null;
  createdAt: number;
  dismissedMonthly: number[]; // blocchi di 4 settimane già visti
  defaultRestSec: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  startDate: '2026-11-16',
  heightCm: 172,
  weeklyGoal: 3,
  trainingWeekday: 2,
  lbPerBlock: 15,
  lastBackupAt: null,
  createdAt: Date.now(),
  dismissedMonthly: [],
  defaultRestSec: 90,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.settings.toArray();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as unknown as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db.settings.put({ key, value });
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings(), []);
}
