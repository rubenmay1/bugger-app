# Bugger

A persistent task-reminder app for Android. Reminders escalate as the deadline approaches - distant tasks ping weekly, today's tasks ping every two hours.

Built on Ionic Angular + Capacitor, with a background verifier (Android WorkManager) that keeps the reminder chain alive even when the OS suspends the app.

## Why

Most reminder apps fire once and forget. Bugger keeps pestering you. Each task has exactly one alarm in flight at a time; when it fires, the handler schedules the next one based on how close the deadline is now. The closer it gets, the more often you hear about it.

A separate 15-minute background job repairs any broken chains - missed alarm, OS killed the listener, JS exception - so a single failure doesn't silently kill the reminder.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full design.

## Features

- Four escalation tiers: `Future` (weekly) -> `Soon` (daily) -> `Today` (every 2h) -> `Expired` (every 2h, post-cutoff).
- Configurable operating window so reminders never fire overnight.
- Health Check screen with a `lastPingAt` heartbeat indicator; red banner appears on the main screen if the background job has been silent for > 2 hours.
- Device Compatibility screen with brand-specific advice for aggressive Android OEMs.
- Swipe-to-complete on the task list.
- Local-only - no servers, no accounts, no cloud sync.

## Tech stack

- Ionic 8 / Angular 20
- Capacitor 8 (Android)
- `@capacitor/background-runner` for the verifier (WorkManager-backed)
- `@capacitor/local-notifications` for the alarm chain
- `@capacitor/preferences` for persistence

## Development

```bash
npm install
npx ionic serve        # web preview (notifications are stubbed)
npx cap open android   # device / emulator
```

The web shim of `@capacitor/local-notifications` is unreliable, so the app gracefully degrades there - scheduling calls are wrapped in `try/catch`, and the health UI hides Android-only diagnostics.

## Scripts (PowerShell)

| Script | What it does |
| --- | --- |
| `scripts/test.ps1` | Runs `ng test --watch=false` with `CHROME_BIN` auto-discovered (Chrome -> Edge fallback) |
| `scripts/run-web.ps1` | `ionic serve` on a pinned port so `localStorage` survives restarts |
| `scripts/emulator.ps1` | `ionic build --prod` -> `cap sync` -> `cap run android` |
| `scripts/publish-apk-patch.ps1` | Bump patch (1.2.5 -> 1.2.6), test, build, open Android Studio |
| `scripts/publish-apk-minor.ps1` | Bump minor (1.2 -> 1.3) |
| `scripts/publish-apk-major.ps1` | Bump major (1.9.3 -> 2.0.0) |

Publish pipeline: tests -> bump `versionCode` + `versionName` in `android/app/build.gradle` -> sync `environment.ts` -> regenerate `runners/verify.js` -> `ionic build --prod` -> `cap sync` -> open Android Studio for signed APK.

## Background runner

`runners/verify.js` is **generated** - the source is `runners/verify-entry.ts`, which imports shared scheduling logic from the Angular source so the headless context and the webview agree on tier boundaries and notification IDs.

Regenerate manually with `npm run build:verify`. The publish scripts do this automatically.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - Hydra chain, verifier contract, persistence keys
- [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) - UI conventions, tokens, component patterns
