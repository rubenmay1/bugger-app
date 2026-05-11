# Bugger

Escalating reminder app. Ionic + Capacitor (Angular), Android-first POC.

## Read on startup

1. **`INITIAL_POC.md`** — historical architecture brief. **Legacy / frozen** — do not edit. Capture any new decisions in this file instead. Still useful as background for the Hydra chain shape, verifier contract, trust surface, and original scope list.
2. **`STYLE_GUIDE.md`** — visual and component conventions. Inherited from a prior app; the Bugger-specific overrides at the bottom take precedence.

## When specs conflict

- Architecture / behaviour → this file, then `INITIAL_POC.md`.
- Visuals / component shape → `STYLE_GUIDE.md` (Bugger overrides win over the inherited body).

Raise real conflicts with the user instead of picking silently.

## Decisions locked for v1.0

These override anything in `INITIAL_POC.md`.

- **Framework:** Ionic Angular.
- **Persistence:** `@capacitor/preferences` (`CapacitorKV`) only. Tasks live as a JSON array under `activeTasks`; verifier and webview share the same store. No SQLite, no Ionic Storage.
- **`taskId` allocation:** monotonic integer in `CapacitorKV` under `nextTaskId`. Read-increment-write on task creation. Notification ID = `taskId * 1000 + sequenceNumber`.
- **Deadline storage:** `task.deadline` is midnight (local time) of the deadline day — a *date*, no time-of-day. The actual cutoff is derived at read time by `effectiveDeadline(task, prefs)`.
- **Safety buffer:** `effectiveDeadline = deadline + (operatingWindowEndHour - 1)`. The final hour of the window is reserved as Android-delivery slack — tier flips to expired and the final ping fires one hour before the user-visible window end.
- **Grid-aligned scheduling:** every ping lands on the operating-window start hour (distant/near) or a 3-hour grid from start hour (urgent). Candidate timestamps never carry wall-clock minutes/seconds from `now`. Final ping clamps to the effective deadline; its body is prefixed `Final Reminder: `.
- **Tier definitions:** `urgent` = deadline day is today (or earlier, pre-cutoff); `near` = 1–7 calendar days ahead; `distant` = >7 days; `expired` = `now ≥ effectiveDeadline`.

## Sync points (change one, change the other)

The verifier is a separate JS context with no Angular. Two pairs of files must stay in lockstep:

- `src/app/services/scheduling-math.ts` ↔ `runners/verify.js` — every helper (`effectiveDeadline`, `computeTier`, `computeNextAlarmAt`, `nextGridSlot`, `notificationIdFor`, etc.).
- Notification body shape in `scheduler.service.ts` ↔ `runners/verify.js` — both must apply the `Final Reminder: ` prefix when scheduled time equals the effective deadline.

Each file has a `SYNC NOTE` comment naming its counterpart.

## Web vs Android

The web shim of `@capacitor/local-notifications` is unreliable (browser/OS suppression, missing plugin methods). Boot must not crash there.

- All native-only plugin calls are wrapped in `try/catch`.
- `registerActionTypes` and `createChannel` early-return when `Capacitor.getPlatform() === 'web'`.
- `ensurePermission` only calls `requestPermissions` on native (web requires user-gesture).
- `SchedulerService.scheduleNextLink` writes `task.nextAlarmAt` *before* the OS schedule call, so the Next Alarms UI stays accurate when the shim fails.
- The stale-verifier banner, the per-task "synced to phone" check, and the Force-check button all gate on `getPlatform() === 'android'`.

## Load-time migrations

`TaskService.load()` is the canonical place to normalise persisted state:

- Snap any non-midnight `deadline` to `startOfDay(deadline)`.
- Clear `nextAlarmAt` if it isn't on the top of the hour — pre-grid scheduling artifacts.

Drift is also re-checked in `selfTest()` on every app open, but normalising during `load()` keeps `nextAlarmAt` consistent even when the scheduler can't reschedule (web).

## Tooling

- Tests: `scripts/test.ps1` runs `ng test --watch=false` with `CHROME_BIN` auto-discovered (Chrome → Edge fallback). Window stays open on failure.
- Publish: `scripts/publish-apk-{patch,minor,major}.ps1` compute the new `versionName` per their rule and delegate to `scripts/publish-base.ps1` (tests → bump version → `ionic build --prod` → `cap sync` → open Android Studio). APK output named `bugger-<versionName>.apk` via `android/app/build.gradle`.
