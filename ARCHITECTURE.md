# Bugger - Architecture

Escalating-reminder app for Android. Built on Ionic Angular + Capacitor. Targets Android first; web is supported as a development shim.

## Concept

A task has a deadline. Bugger pesters the user with reminders that get more frequent as the deadline approaches:

| Tier | Window | Cadence |
| --- | --- | --- |
| `Future` | More than 7 days away | Once per week, Monday at window start |
| `Soon` | 1-7 days away | Once per day at window start |
| `Today` | Deadline day, before cutoff | Every 2 hours from window start |
| `Expired` | Past cutoff on deadline day | Every 2 hours within today's window |

Each tier is recomputed on every alarm fire - never pre-baked - so tier transitions are emergent.

## Scheduling: Hydra Chain

Android caps an app at ~500 scheduled alarms. Instead of pre-scheduling a queue, every task has **exactly one alarm in flight**, and each fired alarm's action handler schedules its own successor.

- Task creation -> schedule one notification (the next ping).
- That notification fires -> handler reads the task, recomputes tier, schedules the next link, persists `nextAlarmAt`.
- Repeat until the task is completed or expired.

This means 500 active tasks before hitting the system cap, no bulk cancellation, and no "refresh queue on app open" dependency.

The weakness: if the in-flight alarm is missed (phone off at fire time, OEM kills the listener before it schedules the next link, JS exception in the handler), the chain dies silently. The safety net below handles this.

## Safety net: background verifier

A periodic job runs every 15 minutes via `@capacitor/background-runner` (backed by Android's WorkManager). It verifies every active task has a healthy in-flight alarm and rebuilds any broken chains.

Constraints:
- 15-minute minimum interval (Android limit).
- ~30 second execution budget per run.
- Headless JS context - no DOM, no shared memory with the webview.
- State flows through `CapacitorKV` (a key-value store shared between the webview and the runner context).

The runner stamps `lastPingAt` to `CapacitorKV` on every successful run. The main app reads it on open and surfaces:
- **Green** - last ping < 30 min ago.
- **Amber** - last ping 30 min - 2 hours ago.
- **Red** - last ping > 2 hours ago, or missing. A dismissible banner appears on the task list pointing to the Health Check screen.

On app open, a quick self-test verifies each active task has a pending alarm and silently reschedules anything missing. This makes app-open itself a recovery event.

## Persistence

Everything lives in `@capacitor/preferences` (`CapacitorKV`) as JSON values. The keys, defined in `src/app/models/task.ts`:

| Key | Type | Notes |
| --- | --- | --- |
| `activeTasks` | `Task[]` | Active tasks (one record per task) |
| `completedTasks` | `Task[]` | History |
| `nextTaskId` | `number` | Monotonic counter; read-increment-write on create |
| `userPrefs` | `UserPrefs` | Operating window, OEM tier |
| `lastPingAt` | `number` | Verifier heartbeat |
| `pingHistory` | `number[]` | Last 20 heartbeats (debug view) |
| `scheduleErrorAt` | `number \| null` | Set when the last runner failed to schedule a notification |

`taskId` is a monotonic integer. Notification ID = `taskId * 1000 + sequenceNumber`, giving each task room for ~1000 chained notifications before collision (well above any realistic lifetime).

Deadlines store midnight (local time) of the deadline day. The actual cutoff is derived at read time: `effectiveDeadline = deadline + operatingWindowEndHour`. This means the operating window can change without rewriting stored deadlines.

## Background runner build

`runners/verify.js` is **generated** - do not edit directly. The source is `runners/verify-entry.ts`, which imports shared logic from the Angular source:
- `effectiveDeadline`, `computeTier`, `computeNextAlarmAt`, `notificationBody`, `notificationIdFor` (from `src/app/services/scheduling-math.ts`)
- `DEFAULT_PREFS`, `KV_KEYS` (from `src/app/models/task.ts`)

esbuild bundles these into `verify.js`. Regenerate with `npm run build:verify` (also runs automatically as part of the publish pipeline).

Why share the logic? The verifier and the webview must agree on tier boundaries, alarm grid, and notification IDs - any divergence breaks the chain.

## Web vs Android

The web shim of `@capacitor/local-notifications` is unreliable. Boot must not crash there.

- All native-only plugin calls are wrapped in `try/catch`.
- `registerActionTypes` and `createChannel` early-return when `Capacitor.getPlatform() === 'web'`.
- `ensurePermission` only calls `requestPermissions` on native (web requires a user gesture).
- `SchedulerService.scheduleNextLink` writes `task.nextAlarmAt` **before** the OS schedule call, so the Next Alarms UI stays accurate when the shim fails.
- The stale-verifier banner and per-task "synced to phone" check gate on `getPlatform() === 'android'`.

## Load-time migrations

`TaskService.load()` is the canonical place to normalise persisted state:
- Snap any non-midnight `deadline` to `startOfDay(deadline)`.
- Clear `nextAlarmAt` if it's not on a top-of-hour boundary (pre-grid scheduling artifact).

`selfTest()` also re-checks drift on every app open, but normalising during `load()` keeps the stored data consistent even when the scheduler can't reschedule (e.g. on web).

## Permissions posture

Bugger uses inexact alarms only.

- No `SCHEDULE_EXACT_ALARM` permission requested.
- Notifications may fire 10-60 minutes after their scheduled time.
- The final hour of the operating window is reserved as a safety buffer to absorb that drift.
- Android 13+ requires `POST_NOTIFICATIONS` runtime permission, requested on first launch.

## OEM compatibility

Some Android manufacturers aggressively kill background work regardless of app permissions. Bugger ships an OEM data model from day one:
- `getOEMRiskTier()` reads `Device.getInfo().manufacturer` and maps it to `'none' | 'moderate' | 'high' | 'brutal' | 'unsupported'`.
- The Device Compatibility screen surfaces the tier and brand-specific advice (e.g. disable battery optimisation, enable Autostart).

The threshold logic and UI copy live in `settings.page.ts` and `oem.service.ts`.

## Reliability matrix

| Failure | Recovery |
| --- | --- |
| Phone reboot | WorkManager restores the verifier queue on `BOOT_COMPLETED` |
| Alarm missed (phone off) | Verifier detects `nextAlarmAt < now` and reschedules |
| OEM kills the listener before scheduling the next link | Same as above |
| JS exception in the action handler | Same as above |
| Verifier itself silently stops running | Self-test on app open reschedules missing alarms; red banner if `lastPingAt` is > 2 hours stale |
| User force-stops the app | Unrecoverable until reopen - Android by design |
| User clears app data | Intentional; all state gone |
