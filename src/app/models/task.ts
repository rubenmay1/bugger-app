export type ProximityTier = 'distant' | 'near' | 'urgent' | 'expired';

export type TaskStatus = 'active' | 'completed';

export interface Task {
  id: number;
  name: string;
  createdAt: number;
  deadline: number;
  remindMe: boolean;
  status: TaskStatus;
  completedAt?: number;
  nextAlarmAt?: number;
  sequenceNumber: number;
}

export interface UserPrefs {
  operatingWindowStartHour: number;
  operatingWindowEndHour: number;
  oemRiskTier: 'none' | 'moderate' | 'high' | 'brutal' | 'unsupported';
}

export const DEFAULT_PREFS: UserPrefs = {
  operatingWindowStartHour: 9,
  operatingWindowEndHour: 21,
  oemRiskTier: 'none',
};

export const KV_KEYS = {
  activeTasks: 'activeTasks',
  completedTasks: 'completedTasks',
  nextTaskId: 'nextTaskId',
  userPrefs: 'userPrefs',
  lastPingAt: 'lastPingAt',
  pingHistory: 'pingHistory',
} as const;
