# Zeitblick

Mobile-first overlay camera for matching a historical reference to a present-day view. Images stay on the device; there are no media uploads, ads or analytics.

## Behavior

- Full-height camera layout with a narrow top bar, bottom shutter/opacity controls and a bottom settings sheet.
- Reference opacity 0–100%, independent preview visibility and export mode: clean, with overlay, or both.
- Touch drag, two-finger scale, rotation, keyboard positioning and position lock for the reference.
- The camera crop matches the viewfinder. Reference proportions are preserved. Interface elements never enter the saved image.
- One frozen camera frame is used for both variants. A separate aligned reference layer permits comparison after capture without altering the raw photo.
- Full-screen photo review: toggle the reference, adjust opacity, and inspect at 1–6× with pinch, drag, buttons, mouse wheel or keyboard. Inspection zoom does not crop the exported image.
- Browser: share one/two JPEGs where supported; otherwise download a JPEG or one ZIP containing both JPEGs. An explicit download link is also available.
- Camera permission is requested on explicit start, with no audio. Camera tracks stop on exit, native pause, stop and switch.
- Captures and references remain in memory until reload or replacement.

## Android test app

`mobile/` contains a standalone Android WebView shell and the same frontend, bundled locally for offline use. Package: `de.zeitblick.kamera`, version 1.1.1 (3), Android 10+ (API 29), target API 35.

- Native camera permission and system image picker.
- Native MediaStore saves one or both JPEGs to `Pictures/Zeitblick`. New images stay pending until the batch has been written; failures remove the entries created by that attempt.
- The WebView only serves bundled assets at its local secure origin. External requests are blocked. The app does not load the hosted Site.
- Signed as an installable test APK. Not a Play Store release; actual camera, picker and gallery behavior still requires a physical Android device test.
- Preserve the private signing keystore for future updates; never commit it.

Build the native web bundle, then pass installed official Android build tools (35), platform android.jar (API 35), Eclipse ECJ, the existing test keystore and an output path:

```sh
node node_modules/vite/bin/vite.js build --config mobile/vite.config.ts
python3 mobile/build-apk.py /path/to/build-tools/35.0.0 /path/to/platforms/android-35/android.jar /path/to/ecj.jar /private/path/zeitblick-test.keystore /path/to/Zeitblick-1.1.1.apk
```

The builder uses Java 17, ECJ Java 8 bytecode, D8, aapt2, zipalign and apksigner. It verifies the signed APK. If the specified test key does not exist, it creates one with alias `androiddebugkey` and test password `android`.

## Validation

- `node --experimental-strip-types --test tests/capture.test.mjs`: clean frame isolation, opacity/transform and preview/export geometry.
- `node node_modules/typescript/bin/tsc --noEmit`.
- Production Sites and Android frontend builds; Java compile, DEX, APK signature and manifest checks.
- Store-only ZIP writer checked with independent Python zipfile CRC/content validation.
- Browser checks using a known image fixture: desktop and 390×844 layout, review, zoom, overlay hide/show, opacity extremes and both-file selection. A full-screen dialog positioning defect was fixed during this check.
- Cloud browser did not expose a completed blob download event, so browser download completion and OS share/save remain device checks. Runtime Android camera/gallery testing is unavailable here.
- Optional WebMCP registration is feature-detected; available browser did not expose modelContext.

## Web development

Use the existing pnpm lockfile and Sites scripts. The local execution profile selects the compatible preview/build flow. The web app needs internet to load; the Android package includes its frontend for offline operation.

## Full-screen review regression

The production CSS optimizer folded the previous `translate: none` override into `transform`, leaving the centered dialog's independent Tailwind translate active. Full-screen content now uses an explicit dialog variant that never includes centered translation or zoom-animation classes.

`node node_modules/vite/bin/vite.js build --config tests/vite.review.config.ts` builds the real review component and known image fixture with production optimization to `public/__review-check`. Use only in the supervised local preview, then remove that generated directory before building/deploying the app. Check portrait and landscape bounds, zoom and overlay controls.
