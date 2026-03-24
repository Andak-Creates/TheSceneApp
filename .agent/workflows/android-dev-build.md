---
description: how to do an android development build for emulator
---
# Android Development Build Workflow

Since you are using Expo with a Development Client (`expo-dev-client`), you need to build the native code either locally or via EAS.

## Option 1: EAS Build (Cloud) - Recommended
This builds the app on Expo's servers and provides an APK to download.

1. **Run the build**:
   ```bash
   npx eas build --profile development --platform android
   ```
   *Note: When prompted "How would you like to build your project?", choosing "APK" is essential for emulators.*

2. **Wait for Build & Download**:
   - Once the build is finished in the terminal, it will provide a link to the Expo dashboard.
   - Download the `.apk` file from there.

3. **Install on Emulator**:
   - Ensure your Android Emulator is running.
   - **Drag and drop** the downloaded `.apk` file into the emulator window. This installs the "Development Client".

4. **Start Dev Server (Crucial)**:
   - Use the new script I added to ensure the server looks for the `.dev` package:
   ```bash
   npm run start:dev
   ```
   - Press **'a'** to open on Android.

## Option 2: Local Build (Automated)
Requires Android Studio, Java (JDK), and `ANDROID_HOME` environment variables.

1. **Run build and install**:
   ```bash
   npx expo run:android
   ```
   *This will build the native code locally, install the app on the emulator, and start the dev server automatically.*

## Troubleshooting
- **Missing App Error**: If you see `No development build (...) installed`, it means the APK hasn't been dragged into the emulator yet, OR you are starting the server without `APP_VARIANT=development`. Always use `npm run start:dev`.
- **Package Name Mismatch**: The development build uses `com.vindi.thescene.dev`. The production build uses `com.vindi.thescene`. The server must know which one to look for.
