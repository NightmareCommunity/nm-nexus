# NM NEXUS — Android

## Overview

The Android app is a Capacitor 6 wrapper around the Next.js static export. This gives you a real APK that can be distributed via Play Store or sideloaded, with access to native capabilities (push notifications, camera, microphone, filesystem) that the web app doesn't have.

**Note:** This requires Android Studio + JDK 17+. The build cannot be run in this sandbox — you must run it on your local machine.

## Prerequisites

- Android Studio (Hedgehog or newer)
- JDK 17 (bundled with Android Studio)
- Node.js 20+ and Bun
- A signing keystore (for production builds)

## Setup

### 1. Install Android dependencies

```bash
cd android
bun install
cd ..
```

### 2. Configure environment

The Android app reads the same env vars as the web app. They're baked into the static export at build time, so:

```bash
# In your project root .env.local:
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
NEXT_PUBLIC_STUN_URLS=stun:stun.l.google.com:19302
NEXT_PUBLIC_APP_URL=https://<your-domain>
```

### 3. Build the web assets

```bash
# In project root:
bun install
bun run build
```

This generates `.next/` which Capacitor syncs to the native project.

### 4. Add the Android platform

```bash
npx cap add android
```

This creates `android/` as a real Android Studio project. (The directory currently contains only the package.json wrapper.)

### 5. Sync web assets to native

```bash
npx cap sync android
```

Run this every time you change web code and rebuild.

### 6. Open in Android Studio

```bash
npx cap open android
```

Android Studio launches. Wait for Gradle sync to complete.

## Building

### Debug APK (for testing)

In Android Studio:
1. **Build → Build Bundle(s)/APK(s) → Build APK(s)**
2. APK appears at `android/app/build/outputs/apk/debug/app-debug.apk`
3. Install on a device: `adb install app-debug.apk`

Or via CLI:
```bash
cd android
./gradlew assembleDebug
```

### Release APK (for distribution)

**You need a signing keystore.** Create one (one-time):

```bash
keytool -genkey -v -keystore nm-nexus.keystore -alias nm-nexus -keyalg RSA -keysize 2048 -validity 10000
```

**Keep this keystore safe.** Losing it means you can't update the app on Play Store.

Configure signing in `android/app/build.gradle` (or `capacitor.config.ts`):

```gradle
android {
    signingConfigs {
        release {
            storeFile file('../../nm-nexus.keystore')
            storePassword 'your-store-password'
            keyAlias 'nm-nexus'
            keyPassword 'your-key-password'
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}
```

Build:

```bash
cd android
./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

Or via Capacitor:
```bash
npx cap build android --keystore-path ./nm-nexus.keystore --keystore-pass <pass> --keystore-alias nm-nexus --keystore-alias-pass <pass>
```

## Generating the checksum

After building the release APK:

```bash
cd android/app/build/outputs/apk/release/
shasum -a 256 app-release.apk > SHA256SUMS.txt
cat SHA256SUMS.txt
# Output: <hash>  app-release.apk
```

Place the APK at `releases/nm-nexus.apk` and the checksum at `releases/SHA256SUMS.txt`:

```bash
mkdir -p ../../../../releases
cp app-release.apk ../../../../releases/nm-nexus.apk
cp SHA256SUMS.txt ../../../../releases/SHA256SUMS.txt
```

## Native permissions

The app requires these permissions (auto-included by Capacitor plugins):

- `INTERNET` — Supabase + WebRTC
- `CAMERA` — video calls, avatar capture
- `RECORD_AUDIO` — voice calls, voice messages
- `READ_EXTERNAL_STORAGE` — file attachments
- `POST_NOTIFICATIONS` (Android 13+) — push notifications
- `FOREGROUND_SERVICE` — keep calls alive in background
- `WAKE_LOCK` — prevent sleep during calls

Users are prompted at first use, not at install.

## Push notifications

Capacitor's `@capacitor/push-notifications` plugin uses FCM (Firebase Cloud Messaging).

1. Create a Firebase project at https://console.firebase.google.com/
2. Add an Android app with package name `studio.nightmare.nexus`
3. Download `google-services.json` → place at `android/app/google-services.json`
4. Add the FCM sender ID to Supabase → **Settings → Push → FCM**
5. The app registers a push token on first launch and uploads it to `devices.push_token`

## Camera & microphone

WebRTC's `getUserMedia()` works in the WebView, but Capacitor provides a native fallback via `@capacitor/camera` for still captures (avatars, file uploads).

For video calls, the WebView handles camera/mic access directly. Capacitor 6+ supports this on Android 7+.

## Back navigation

Android hardware back button:
- If a conversation/channel is open → return to list
- If a modal/drawer is open → close it
- Otherwise → exit the app (or go to home screen)

Implement in `MainActivity.java`:

```java
import android.webkit.WebView;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private WebView webView;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = this.bridge.getWebView();
    }
    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
```

## Play Store release

1. Build a signed **AAB** (Android App Bundle), not APK:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Output: `android/app/build/outputs/bundle/release/app-release.aab`

2. Create a Play Store listing at https://play.google.com/console
3. Upload the AAB to **Production → Create new release**
4. Complete store listing, content rating, privacy policy URL
5. Submit for review (typically 1-3 days)

### Required Play Store assets

- App icon: 512×512 PNG
- Feature graphic: 1024×500 PNG
- Phone screenshots: min 2, max 8 (16:9 or 9:16)
- Privacy policy URL (required — host on your website)
- App category: Communication
- Target audience: 13+

## Testing on a device

1. Enable Developer Mode on your Android phone (Settings → About → tap Build Number 7 times)
2. Enable USB debugging
3. Connect via USB
4. In Android Studio: **Run → Run 'app'**
5. Select your device → OK

## Troubleshooting

**WebView shows blank screen**
- Check `npx cap sync android` was run after the last web build
- Check `android/app/src/main/assets/public/index.html` exists
- Check `capacitor.config.ts` → `webDir: 'out'` matches your Next.js output

**Camera/mic not working**
- Verify permissions in `AndroidManifest.xml`
- Check WebView version — Android System WebView must be up to date
- Test on a real device, not emulator (emulators have fake cameras)

**Push notifications not arriving**
- Verify `google-services.json` is in `android/app/`
- Verify FCM sender ID in Supabase matches Firebase project
- Check `devices.push_token` is populated in the DB
- Check Android notification settings for the app

**Build fails with Gradle error**
- Delete `android/.gradle/` and `android/build/`
- Run `npx cap sync android` again
- Run `./gradlew clean` then rebuild

## Native module additions (future)

For features the WebView can't do:
- **Background service** for incoming calls (Capacitor CallKeep plugin)
- **Native file picker** with MIME filtering
- **Biometric auth** (Capacitor BiometricAuth)
- **Local notifications** for in-app events when app is in background

Each requires adding the plugin, configuring permissions, and rebuilding.
