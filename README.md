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
- Browser camera permission is requested on explicit start; the APK starts automatically and requests Android camera permission once, with no audio. Camera tracks stop on exit, native pause, stop and switch.
- Captures and references remain in memory until reload or replacement.

## Android test app

`mobile/` contains a standalone Android WebView shell and the same frontend, bundled locally for offline use. Package: `de.zeitblick.kamera`, version 1.3.0 (7), Android 10+ (API 29), target API 35.

- Native Camera2 preview and still JPEG capture through a TextureView behind the control UI. The APK no longer uses WebRTC camera capture.
- Lens selector lists public cameras and physical cameras exposed through Android's logical-camera API. Unsupported physical stream combinations produce a recoverable lens-selection error. Manufacturer-private lenses are not bypassed.
- Exposure compensation uses the selected camera's advertised range and EV step. Automatic exposure and continuous autofocus stay enabled where available.
- Camera automatically starts and stops with foreground/review lifecycle. The native root consumes status/navigation/cutout insets; WebView page zoom is disabled.
- Native system image picker decodes HEIC/HEIF and Android-supported formats using ImageDecoder on an IO executor. Reference images are bounded to 3072 pixels per edge and 6 MP; originals are unchanged.
- Overlay and side-by-side modes in the live view and captured review, with synchronized review pan/zoom. Two-finger reference gestures rotate and scale about the fingers' midpoint.
- Gesture rendering is coalesced per animation frame; preview canvases are reused and export encoding occurs only on save.
- Native MediaStore saves one or both JPEGs to `Pictures/Zeitblick`. New images stay pending until the batch has been written; failures remove the entries created by that attempt.
- The WebView only serves bundled assets at its local secure origin. External requests are blocked. The app does not load the hosted Site.
- Signed as an installable test APK. Not a Play Store release; actual camera, picker and gallery behavior still requires a physical Android device test.
- Preserve the private signing keystore for future updates; never commit it.

Build the native web bundle, then pass installed official Android build tools (35), platform android.jar (API 35), Eclipse ECJ, the existing test keystore and an output path:

```sh
node node_modules/vite/bin/vite.js build --config mobile/vite.config.ts
python3 mobile/build-apk.py /path/to/build-tools/35.0.0 /path/to/platforms/android-35/android.jar /path/to/ecj.jar /private/path/zeitblick-test.keystore /path/to/Zeitblick-1.3.0.apk
```

The builder uses Java 17, ECJ Java 8 bytecode, D8, aapt2, zipalign and apksigner. It verifies the signed APK. If the specified test key does not exist, it creates one with alias `androiddebugkey` and test password `android`.

## Validation

- `node --experimental-strip-types --test tests/capture.test.mjs`: clean frame isolation, opacity/transform and preview/export geometry.
- `node node_modules/typescript/bin/tsc --noEmit`.
- Production Sites and Android frontend builds; Java compile, DEX, APK signature and manifest checks.
- Store-only ZIP writer checked with independent Python zipfile CRC/content validation.
- Browser checks using a known image fixture: desktop and 390×844 layout, review, zoom, overlay hide/show, opacity extremes and both-file selection. A full-screen dialog positioning defect was fixed during this check.
- Production browser fixture verified both native-bridge JPEG payloads: clean pixels [110,134,82] versus overlay pixels [241,59,58] at the same coordinate, both 1200×1600. Opacity changes and inspection zoom did not trigger JPEG encoding; saving both encoded only the composite. Native bridge doubles verified automatic start, lens switching, preview bounds, and exposure dispatch. These doubles do not validate camera hardware. Runtime Android camera/gallery testing is unavailable here.
- Optional WebMCP registration is feature-detected; available browser did not expose modelContext.

## Web development

Use the existing pnpm lockfile and Sites scripts. The local execution profile selects the compatible preview/build flow. The web app needs internet to load; the Android package includes its frontend for offline operation.

## Full-screen review regression

The production CSS optimizer folded the previous `translate: none` override into `transform`, leaving the centered dialog's independent Tailwind translate active. Full-screen content now uses an explicit dialog variant that never includes centered translation or zoom-animation classes.

`node node_modules/vite/bin/vite.js build --config tests/vite.review.config.ts` builds the real review component and known image fixture with production optimization to `public/__review-check`. Use only in the supervised local preview, then remove that generated directory before building/deploying the app. Check portrait and landscape bounds, zoom and overlay controls.

## Android preview fix 1.2.1

The native camera branch no longer mounts an HTML video element. Previously, marking Camera2 ready made the unused browser video visible; Android WebView could paint its default play-button poster over the working TextureView. Browser-only capture still mounts its video element.

## Preview geometry fix 1.2.2

TextureView already applies sensor orientation. PreviewGeometry undoes its aspect stretch using sensor-oriented buffer dimensions, applies a uniform center-cover scale, and compensates display rotation only. A DisplayListener also updates 180-degree rotations that do not resize the view. JPEG orientation remains separate. See https://developer.android.com/media/camera/camera2/camera-preview#textureview . Host geometry checks cover sensor/display quarter turns, portrait, landscape and narrow comparison panes; physical device verification remains required.

## Offline alignment editor 1.3.0

Open **Bilder ausrichten** and select the historical (fixed) and current (transformed) images. Automatic AKAZE matching with mutual ratio filtering and RANSAC estimates a projective transformation entirely on device. At least four non-collinear matching point pairs can also be placed manually. Drag numbered points to refine them; pinch to inspect details. Local deformation uses a thin-plate residual warp with corner anchors. Different viewpoints and occlusions cannot always be reconciled; inspect results and correct pairs manually.

The comparison supports opacity and a before/after divider. Select a shared crop with draggable corners or aspect presets. Save the transformed current photo or a JPEG composite at the selected opacity. GIF and silent video animate old to new over 4, 6 or 8 seconds, optionally returning to old. All exports share the selected crop. GIF is limited to 512 pixels on its longest edge; video to 1280 with even dimensions for encoder compatibility. Video uses an available MP4 or WebM MediaRecorder encoder; unsupported devices show an actionable error. Keep the app foregrounded while video is recorded.

Prepared images are bounded to 3072 pixels / 6 MP. The latest image pair, points, crop and opacity are persisted locally in IndexedDB; originals are unchanged. JPEG/GIF go to Pictures/Zeitblick; videos go to Movies/Zeitblick using Android MediaStore. Clearing app data removes the local draft.

OpenCV 4.13.0 is bundled at public/alignment/opencv.js from the official OpenCV documentation distribution, with its license. gifenc 1.0.3 is vendored from its npm distribution with its MIT license. Neither algorithm requires a cloud request. No website deployment is required for APK updates.

Validation: geometry tests cover projective recovery, invalid point layouts, local deformation and transparent out-of-bounds pixels. A production browser fixture exercised the actual bundled OpenCV worker (2446 inliers on the synthetic pair), a square crop, opacity and JPEG/GIF/video encoding through a native-storage double. Android compilation/signature validation is separate; hardware and gallery integration still require a physical Android test.
