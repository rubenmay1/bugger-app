const DAY_MS = 24 * 60 * 60 * 1000;

export type DeadlineKey = 'today' | 'tomorrow' | 'inWeek' | 'inMonth';

export interface DeadlineOption {
  key: DeadlineKey;
  label: string;
}

export const DEADLINE_OPTIONS: readonly DeadlineOption[] = [
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'inWeek', label: 'In a Week' },
  { key: 'inMonth', label: 'In a Month' },
];

export function computeDeadline(key: DeadlineKey, now: number): number {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  switch (key) {
    case 'today': return base.getTime();
    case 'tomorrow': return base.getTime() + DAY_MS;
    case 'inWeek': return base.getTime() + 7 * DAY_MS;
    case 'inMonth': return base.getTime() + 30 * DAY_MS;
  }
}
