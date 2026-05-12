# 🪲 Bugger

Persistent Task Reminder app for Android. Pings get more frequent as the deadline approaches.

Built on Ionic Angular + Capacitor. Background verifier (WorkManager) keeps the chain alive when Android suspends the app.

## Run

```bash
npm install
npx ionic serve        # web preview
npx cap open android   # device/emulator
```

## Scripts

- `scripts/test.ps1` — unit tests
- `scripts/run-web.ps1` — `ionic serve` on a pinned port
- `scripts/publish-apk-{patch,minor,major}.ps1` — version bump → test → build → open Android Studio

## Docs

- [`CLAUDE.md`](./CLAUDE.md) — architecture + decisions
- [`STYLE_GUIDE.md`](./STYLE_GUIDE.md) — UI conventions
- [`INITIAL_POC.md`](./INITIAL_POC.md) — historical brief (frozen)
