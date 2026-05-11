# 🪲 Bugger — Escalating Reminder App (POC Spec)

> **For Claude Code:** This document is the source of truth for the POC architecture. A `STYLE_GUIDE.md` lives in the repo root and governs all JavaScript style — follow it for every file you produce. When in doubt about an architectural decision, refer back to this document rather than improvising.

---

## 1. Concept

Bugger is a task reminder app whose entire premise is to **pester the user with escalating frequency** as a deadline approaches. The closer the deadline, the more often the user is reminded — until they either complete the task or the deadline passes.

All scheduling is local (no servers, no push). The app is built with **Ionic + Capacitor** targeting Android first (iOS later).

---

## 2. The Escalating Cadence

| Proximity to Deadline | Frequency | Timing Behavior |
| :--- | :--- | :--- |
| **Distant** (> 1 week away) | Every 3 days | Within user's operating window |
| **Near** (within next week) | Every day | At the start of the operating window |
| **Urgent** (today or tomorrow) | Every 3 hours | Distributed across the operating window |
| **Expired** | Final ping | One-off alert at the exact deadline time |

### 2.1 User Preferences

- **Operating Window:** User defines active hours (e.g. 9:00 AM – 9:00 PM). No notifications fire outside this range.
- **Safety Buffer:** No notifications are scheduled in the **final hour** of the operating window. This absorbs Android's inexact-alarm drift (10–60 min) and prevents late-night alerts.

### 2.2 Tier Transitions

Tiers are **recomputed on every alarm fire**, not pre-baked at task creation. When a notification handler runs, it asks "given the current time and the task's deadline, what tier are we in?" and schedules the next alarm accordingly. This avoids stale schedules when a task crosses a tier boundary.

---

## 3. Architecture: Hydra Chain + Background Verifier

The core design decision is to **never pre-schedule a long queue of alarms**. Instead, each task has exactly **one alarm in flight at a time**, and every fired alarm is responsible for scheduling its own successor.

### 3.1 Why Not Static Bulk Scheduling

- Android caps an app at **500 scheduled alarms total**. A user with 20 tasks on a 3-hour cadence over multiple weeks would blow past this trivially.
- Pre-scheduling locks in cadence decisions that may need to change (tier transitions, user pref changes, deadline edits).
- Cancellation becomes a bulk operation tied to many IDs.

### 3.2 The Hydra Pattern

For each active task:

1. Task creation → schedule **one** local notification (the next ping).
2. When that notification fires, its action listener:
   - Reads the task's current state.
   - Computes proximity tier based on `now` vs `deadline`.
   - Schedules **one** new notification (the next link in the chain).
   - Persists `nextAlarmAt` for that task.
3. Repeat until the task is completed or expired.

**Properties:**
- One alarm per active task → 500 active tasks before hitting the system cap.
- Tier transitions are emergent — no special handling needed.
- Cancellation = cancel one alarm + clear `nextAlarmAt`.
- No "refresh queue" dependency on the app being opened.

**The weakness:** if the single in-flight alarm is missed (phone off during fire time, OEM kills the listener before it schedules the next link, JS exception in the handler), the chain dies silently. That is what the safety net exists for.

### 3.3 The Safety Net: Periodic Background Verifier

A periodic background job runs every 15 minutes (the Android minimum). Its only job is to **verify every active task has a healthy in-flight alarm** and rebuild any broken chains.

The verifier is implemented using **`@capacitor/background-runner`** — the official Capacitor plugin, backed by Android's WorkManager. It runs a headless JS context separate from the main webview, integrates cleanly with `CapacitorKV` and `CapacitorNotifications`, and survives reboot natively (WorkManager restores its own queue on `BOOT_COMPLETED`).

**Constraints:**

- 15-minute minimum interval — cannot run more often even if desired.
- ~30-second execution budget per run; the OS kills the context after that.
- No DOM, no shared in-memory state with the main webview.
- Debugging on Android is limited (Android Studio App Inspector view of WorkManager).

State is shared between the main webview and the headless verifier context via **`CapacitorKV`**, a key-value store exposed inside the runner context.

### 3.4 Data Flow Summary

```
┌─────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   Main App      │       │   CapacitorKV    │       │  Background     │
│   (webview)     │◄─────►│  (shared store)  │◄─────►│  Verifier (JS)  │
│                 │       │                  │       │  every 15 min   │
│  • Task CRUD    │       │  activeTasks:[]  │       │                 │
│  • First sched  │       │  userPrefs:{}    │       │  • Verify chain │
│  • Action       │       │  lastPingAt:ts   │       │  • Reschedule   │
│    listeners    │       │  oemRiskTier:'.' │       │    missed       │
│  • Self-test    │       │                  │       │  • Stamp        │
│    on open      │       │                  │       │    lastPingAt   │
└─────────────────┘       └──────────────────┘       └─────────────────┘
         │                                                    │
         │                                                    │
         └──────────────► LocalNotifications ◄────────────────┘
                          (AlarmManager)
```

---

## 4. Reliability Matrix

How each failure mode is handled:

| Failure | Recovery Mechanism | Worst-case gap |
| :--- | :--- | :--- |
| Phone reboot | Plugin's BootReceiver + WorkManager-backed verifier | Next verifier tick (~15 min) |
| Alarm missed (phone off at fire time) | Verifier detects `nextAlarmAt < now` and reschedules | ~15 min |
| OEM kills listener before scheduling next link | Verifier detects stale `nextAlarmAt` and reschedules | ~15 min |
| JS exception in action handler | Same as above | ~15 min |
| Verifier itself silently stops running | Self-test on app open reschedules missing alarms; red banner surfaces if `lastPingAt` is > 2 hours stale | Until next app open |
| User force-stops app | Unrecoverable until user reopens — Android by design | Until next app open |
| User clears app data | Intentional — all state gone | n/a |

The 15-minute floor on the verifier is acceptable because the tightest cadence (Urgent tier, 3-hour interval) is far longer than the recovery window.

---

## 5. User-Visible Reliability — The Trust Surface

**Core principle: the user must be able to tell that Bugger has silently stopped working, before they miss a deadline because of it.**

A pestering app that silently stops pestering is worse than no app at all — it gives false confidence. v1.0 ships to two users on Pixel 8a where this is unlikely but not impossible (Google Play Services hiccups, Android updates, edge cases). The trust surface is therefore lightweight but uncompromising: invisible in the normal case, impossible to miss when something is genuinely broken.

### 5.1 The Last-Ping Heartbeat

The background verifier writes a timestamp (`lastPingAt`) to `CapacitorKV` on every successful run (every 15 minutes). The main app reads it on every open. The traffic-light interpretation:

- **Green** — last ping < 30 min ago. Healthy.
- **Amber** — last ping 30 min – 2 hours ago. Verifier is running slowly but the system isn't broken.
- **Red** — last ping > 2 hours ago, or `lastPingAt` is missing entirely. The verifier has been silenced and reminders may be dropping.

These thresholds are tuned for stock Android on Pixel hardware. On hostile OEMs they would need to be looser to avoid false alarms.

### 5.2 Where the Indicator Lives

The traffic-light indicator lives on the **Health Check screen in settings** (§5.3), not on the main task list. The main screen stays clean and task-focused.

However, if the indicator would be **red**, the main screen displays a small, dismissible banner at the top:

> ⚠ Bugger's background reminders may not be working. Tap to diagnose.

Tapping the banner deep-links to the Health Check screen. Green and amber states are never shown on the main screen — only red breaks through. This keeps the main screen clean in the normal case while making silent dropout impossible to miss.

### 5.3 Health Check Screen (Settings)

A dedicated screen in settings showing:

- The current traffic-light indicator with the raw `lastPingAt` timestamp ("Last check: 8 minutes ago").
- A short explanation of what the verifier does and why it matters.
- A "Force check now" button that dispatches the verifier event immediately (useful for debugging).
- A sparse history of the last several `lastPingAt` timestamps (useful for spotting drift patterns).

### 5.4 Self-Test on App Open

When the user opens the app, before rendering the task list, run a quick sync check:

1. Read the active-task list from `CapacitorKV`.
2. For each active task, verify a notification is actually scheduled (`LocalNotifications.getPending()` returns it).
3. If any tasks are missing their alarm, **silently reschedule them inline** — don't wait for the next verifier tick.
4. The red banner (§5.2) handles the case where the verifier itself has been silenced; individual missed alarms are repaired without user-facing noise.

This makes app-open itself a recovery event.

### 5.5 OEM Awareness — Data Model Only for v1.0

v1.0 ships to two Pixel 8a phones. Stock Android is friendly to WorkManager and the trust surface above is sufficient. However, the data model is built **OEM-aware from day one** so that publish-time work is purely additive (UI screens, deep-link launchers, severity-graded onboarding) rather than requiring data-model migration.

**What v1.0 includes:**

- A `getOEMRiskTier()` utility function that reads `Device.getInfo().manufacturer` and maps it to one of `'none' | 'moderate' | 'high' | 'brutal' | 'unsupported'`. For v1.0, all manufacturers return `'none'` (the lookup table is a stub).
- An `oemRiskTier` field persisted in `userPrefs` within `CapacitorKV`, populated on first launch.
- A `// TODO: publish-time` comment near the stub mapping table, listing known-aggressive manufacturers (Samsung, OnePlus, Oppo, Realme, Vivo, Xiaomi, Huawei) for future implementation.

**What v1.0 does NOT include:**

- The onboarding screens themselves.
- Deep-link launchers to OEM settings pages.
- Threshold tuning based on tier (red banner uses the Pixel-tuned 2-hour threshold for everyone in v1.0).
- Any UI surfacing of `oemRiskTier`.

This keeps the data model honest without committing to UI work that can't be validated until the app runs on hostile hardware.

---

## 6. Permissions Posture

We deliberately stay on **inexact alarms** to avoid friction:

- No `SCHEDULE_EXACT_ALARM` permission requested.
- Notifications may fire 10–60 minutes after their scheduled time — explicitly accepted.
- The safety buffer (final hour of operating window) is sized for this drift.
- Android 13+ requires `POST_NOTIFICATIONS` runtime permission — we request this on first launch.

---

## 7. Rich Interactivity

Each notification carries one action in v1.0:

- **Mark as Completed** — fires a background action handler that:
  1. Identifies the `taskId` from the notification metadata.
  2. Cancels the in-flight alarm for that task.
  3. Marks the task as complete in `CapacitorKV` and in app DB.
  4. Removes the task from the verifier's active set.

Tapping the notification body (not an action button) opens the app to the task detail screen.

---

## 8. Notification ID Strategy

Every scheduled notification needs a unique 32-bit integer ID so it can be targeted for cancellation.

```
notificationId = (taskId * 1000) + sequenceNumber
```

- `taskId` is a monotonically increasing integer assigned at task creation.
- `sequenceNumber` increments each time a new link is added to the chain (resets per task).
- The 1000 multiplier gives each task room for ~1000 chained notifications before collision (more than enough for any realistic task lifetime).

If a task ever needs more than 1000 chained notifications, log a warning and wrap the sequence number — collisions in practice are vanishingly unlikely because completion or expiry will terminate the chain long before then.

---

## 9. Background Verifier Contract

The verifier file (`runners/verify.js`) runs inside the `@capacitor/background-runner` headless JS context. It follows a strict contract:

- **Trigger:** every 15 minutes (configured in `capacitor.config.ts` via the `BackgroundRunner.interval` field), and automatically after boot via WorkManager.
- **Must complete in < 30 seconds** — call `resolve()` before the OS kills the context. Failure to resolve will cause the OS to kill the process and may degrade scheduling reliability.
- **Stateless** — read everything from `CapacitorKV` at start, write everything to `CapacitorKV` at end. No module-level variables; the context is destroyed between runs.
- **No DOM, no `fetch` to app APIs, no Ionic state access.** The verifier runs in a headless JS context — none of the webview's globals exist.
- **Single responsibility:** for each active task, if `nextAlarmAt` is missing OR `nextAlarmAt < now`, recompute proximity tier, schedule a new notification via `CapacitorNotifications`, and update `nextAlarmAt`.
- **Always stamp `lastPingAt`** in `CapacitorKV` before resolving, even if no work was done. This is the heartbeat the UI reads (§5.1). If the verifier resolves without stamping, the health indicator can't distinguish "ran cleanly, nothing to do" from "didn't run at all."

The verifier does **not** create or delete tasks. It only repairs alarm chains for tasks the main app has already registered, and stamps its own liveness.

---

## 10. POC Scope (What's In / What's Out)

### In scope for v1.0

- Task CRUD (create, edit, delete, mark complete).
- Single-range operating window preference + safety buffer.
- Hydra chain scheduling for all four proximity tiers.
- Background verifier job using `@capacitor/background-runner`, ticking every 15 minutes.
- "Mark as Completed" notification action.
- Self-test on app open (§5.4) — silent inline repair.
- Health Check screen in settings with traffic-light indicator (§5.3).
- Red dismissible banner on main screen when `lastPingAt` is > 2 hours stale (§5.2).
- OEM data-model stub (§5.5) — `getOEMRiskTier()` returns `'none'` for all manufacturers; UI work deferred.
- Android target only.

### Out of scope

- iOS support (Capacitor abstracts most of it, but iOS BGTaskScheduler has different constraints).
- OEM onboarding UI, deep-link launchers, severity-graded thresholds.
- Snooze action.
- Per-task cadence overrides.
- Multi-range operating windows / quiet-hours exclusions.
- Recurring tasks (every task has a single deadline).
- Tags, categories, search.
- Sync, accounts, cloud backup.
- Statistics / completion history.

---

## 11. Glossary

- **Hydra chain** — the pattern where each notification's action handler schedules exactly one successor, so there's never more than one alarm in flight per task.
- **Operating window** — the user's preferred active hours during which notifications may fire.
- **Safety buffer** — the final hour of the operating window in which no alarms are scheduled, to absorb inexact-alarm drift.
- **Proximity tier** — one of {Distant, Near, Urgent, Expired}, computed from `deadline - now`.
- **Verifier** — the headless JS file (`runners/verify.js`) executed every 15 minutes by `@capacitor/background-runner`. Verifies and repairs alarm chains, and stamps `lastPingAt`.
- **`CapacitorKV`** — the key-value store exposed inside the Background Runner headless context. The shared bridge between the main webview and the verifier.
- **Last-ping** — the timestamp the verifier writes to `CapacitorKV` on every successful run. Drives the health indicator (§5.1) and the red banner (§5.2).
- **Trust surface** — the collective user-visible elements (§5) that let the user discover when Bugger has silently stopped working.
- **OEM risk tier** — one of `'none' | 'moderate' | 'high' | 'brutal' | 'unsupported'`, indicating how aggressive the device manufacturer's battery management is. Stubbed in v1.0 (always `'none'`).
