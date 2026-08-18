import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'studio.nightmare.nexus',
  appName: 'NM NEXUS',
  webDir: 'out',                  // Next.js static export output
  bundledWebRuntime: false,
  backgroundColor: '#07060c',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,  // false in production builds
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
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
    // For development: point at your dev server. For production builds, leave unset
    // and bundle the static export.
    // androidScheme: 'https',
  },
};

export default config;
