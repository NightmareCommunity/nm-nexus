import type { CapacitorConfig } from '@capacitor/cli';

/**
 * NM NEXUS — Capacitor (Android) configuration.
 *
 * This app is a Next.js SSR application deployed to Cloudflare Workers.
 * The APK is a WebView shell that loads the live deployment — this gives
 * users the latest version automatically, no static export required.
 *
 * Build the APK:
 *   cd /home/z/my-project
 *   bun run build:android
 *
 * The output APK is at android/app/build/outputs/apk/debug/app-debug.apk
 */
const config: CapacitorConfig = {
  appId: 'studio.nightmare.nexus',
  appName: 'NM NEXUS',
  webDir: 'public',  // fallback static assets (PWA icons/manifest)
  bundledWebRuntime: false,
  backgroundColor: '#07060c',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#07060c',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      androidSpinnerStyle: 'large',
      spinnerColor: '#c4b5fd',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#7c3aed',
      sound: 'bell.wav',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Camera: {
      permissions: ['camera', 'photos'],
    },
    Microphone: {
      permissions: ['microphone'],
    },
  },
  server: {
    // Live deployment — APK always loads the latest version from Cloudflare.
    url: 'https://nm-nexus.ojaskhanna432.workers.dev',
    cleartext: false,
  },
};

export default config;
