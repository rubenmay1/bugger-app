import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.bugger',
  appName: 'Bugger',
  webDir: 'www',
  plugins: {
    BackgroundRunner: {
      label: 'app.bugger.verifier',
      src: 'runners/verify.js',
      event: 'verify',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
    LocalNotifications: {
      // Single high-importance channel for Hydra pings. Channel-level importance
      // is locked at create time on Android 8+; bumping it later requires a new id.
      smallIcon: 'ic_stat_icon',
      iconColor: '#22C55E',
    },
  },
};

export default config;
