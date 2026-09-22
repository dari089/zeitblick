# Zeitblick

Mobile-first overlay camera for matching a historical reference to a present-day view. Images stay on the device; there are no media uploads, ads or analytics.

## Selbst weiterentwickeln

Die deutsche Anleitung steht in [ENTWICKLUNG.md](ENTWICKLUNG.md). Der Quellcode enthält Foto-Kamera, Bildausrichtung, Videovergleich und den Android-Unterbau.

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

`mobile/` contains a standalone Android WebView shell and the same frontend, bundled locally for offline use. Package: `de.zeitblick.kamera`, version 1.7.1 (12), Android 10+ (API 29), target API 35.

- Native Camera2 preview and still JPEG capture through a TextureView behind the control UI. Photo mode uses Camera2; Video mode uses WebRTC.
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
python3 mobile/build-apk.py /path/to/build-tools/35.0.0 /path/to/platforms/android-35/android.jar /path/to/ecj.jar /private/path/zeitblick-test.keystore /path/to/Zeitblick-1.7.0.apk
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

## Point editor 1.4.0

The point editor shows one image at full width with Historical/Current tabs. Pan and pinch are safe by default: existing points move only after selecting a pair and choosing Point bearbeiten. A tap selects a marker; a drag in browse mode pans the image. Finish editing to lock again. Add point pairs explicitly; selecting the historical location advances to the current image. Image zoom is retained when switching tabs. Export controls appear in Compare, keeping the point workspace larger. The Offline badge is removed.

Bereiche suchen provides separate normalized search rectangles for both photos. AKAZE/RANSAC runs on these crops at up to 1600 pixels, and matches are mapped back using the integer crop bounds into each original image's normalized coordinate space. Up to 16 distributed, nonduplicate pairs are appended, respecting the existing 32-pair limit. Existing pairs, local-warp base, images and export crop remain unchanged; undo restores the prior set. Unreliable matches or invalid merged geometry produce a recoverable error.

Browser validation with the production fixture: a drag over a locked point preserved its coordinates; explicit editing changed the selected point; regional search appended 16 pairs to the original 16, whose coordinates remained unchanged. Physical Android touch and camera testing remains necessary.

## Workspace and explicit alignment 1.5.0

Image import buttons scroll away. Pinned Alt/Neu controls switch images; the point editor also offers a side-by-side view. A compact footer contains Align, Export and Undo. Export format, animation and save controls now live in a modal with focus handling and dismiss protection during saving.

Tap a marker or numbered pair to enter editing directly; dragging in browse mode pans without moving markers. Tapping the selected marker no longer exits editing. Finish editing locks markers again. All points can be cleared in one action and restored with Undo.

Automatic search appends matches instead of replacing manual work. Edited or manually created pairs are marked as manual. The explicit Align action uses every current pair, renders the comparison and reports the applied count including manual points. Changes invalidate the prior preview/export until Align is pressed. This avoids exporting an outdated result. Search and Align are separate actions.

Regional search retains existing anchors and supports up to 64 pairs. Frames can be resized, moved or newly drawn outside the existing rectangle. It accepts eight RANSAC inliers for regional searches while preserving mutual matching, inlier-ratio and spread checks. Projective validation is applied to the merged full-image geometry instead of extrapolating a cropped-region matrix beyond the area used for matching. Errors and successes are surfaced as toasts and status text; unrelated or highly changed photos can still require manual pairs.

1.5.0 validation: production mobile fixture verified a manual correction retained through regional search (32 applied pairs, including one manual), different search bounds, side-by-side visibility, popup placement, clearing all points and Undo restoring them. The final popup JPEG save was tested through the decoding native-storage double. Nine geometry/capture tests and TypeScript checking passed. Actual Android hardware testing is not available.

## Video workspace and gallery picker 1.6.0

The Video tab offers filming with a still-image/video reference and comparison of two existing videos. Both modes support opacity overlay and side-by-side composition, reference drag/scale/rotation, playback/seeking and (for two videos) a current-video time offset. The live video branch uses a real WebRTC stream drawn into canvas; the existing native Camera2 photo mode is stopped while it is active. Front/rear switching is available in Video; the physical-lens controls remain in the Photo camera.

Camera recording is clean by default, with an explicit switch to bake in the reference or side-by-side composition. Comparison recording saves the shown composition. Clips are silent, limited to 60 seconds and a bounded encoded size, 720×1280 for overlay/clean or 1280×1280 for side-by-side, with contain fitting to avoid stretching. The local WebView's MediaRecorder selects MP4/H.264 if supported, otherwise WebM. A playable review precedes explicit gallery saving. Backgrounding stops recording and camera tracks; export/saving can fail if available memory/storage or device codecs are insufficient. Original videos are not modified. Imported media and unsaved recordings are held for this session only.

The Android picker now honors image-only and video-only accept filters, uses ACTION_GET_CONTENT, and offers installed ACTION_PICK gallery handlers as chooser alternatives. This allows compatible Samsung Gallery activities to appear without hard-coding its package or requesting broad media-library permissions. Image selections still use native ImageDecoder for HEIC. Video playback depends on the Android WebView codec; MP4/H.264 is the interoperability fallback. Samsung resolver behavior requires physical-device verification.

Video tests: browser fixture supplies generated moving clips and a synthetic camera stream, while the actual UI/canvas/MediaRecorder run in the production bundle. Its storage double decodes saved videos and reports dimensions, duration and center pixel so clean/composite output can be distinguished. The fixture does not validate physical cameras or Samsung Gallery. Aspect-fit tests cover portrait and landscape media.

Validated clean video: MP4 720×1280, decoded camera-center RGB [32,145,80], no blue reference contribution despite visible preview overlay. Two-video side-by-side recording was exercised with a 0.2-second source offset. TypeScript and ten geometry/capture/aspect tests passed; Android compilation and signature verification passed.

## Android 1.7.0 — camera detail and zoom

- Photo output targets roughly 12 MP independently of preview quality; default preview targets Full HD (optional 720p). Prefer the rear camera nearest 24 mm on startup. Still capture requests high-quality noise reduction/edge processing when supported. Actual photo dimensions depend on the lens and viewfinder crop.
- Camera2 zoom uses CONTROL_ZOOM_RATIO on supported API 30+ devices, with centered sensor crop fallback. Forced physical outputs expose zoom only when their parent supports physical SCALER_CROP_REGION requests. The same zoom is applied to preview and still capture. Lens shortcuts use reported 35 mm equivalent focal lengths; zoom shortcuts are constrained to the camera-reported range. An Auto lens lets Android manage available optical transitions.
- Photo camera zoom has its own slider/presets; pinch zooms the camera when no reference is active or the reference is locked/hidden. Unlocked reference gestures retain their meaning. Zoom is retained after photo review for the same lens.
- Video requests 1920×1080 source frames, exports portrait 1080×1920 or side-by-side 1920×1920 at 8 Mbps, and draws at most about 30 times/sec. Output uses aspect-preserving contain, so landscape sources retain letterboxing. Device-reported video sources and continuous track zoom are selectable if WebView exposes them. Unsupported zoom is explained, not simulated as UI scaling. Clips stop at 60 seconds or roughly 45 MB, whichever comes first.
- Validation: TypeScript and 10 geometry/alignment tests; native compile and APK signature verification; mobile browser fixture checks photo zoom presets, arbitrary zoom and lens switching. Real browser MediaRecorder fixture exports decoded 1080×1920 clean video and 1920×1920 side-by-side video with correct source colors, and checks asynchronous track zoom. Fixtures mock camera hardware/Android bridge; Samsung lens availability, optical transitions, and real image quality still require a device test.
- Camera2 zoom semantics: https://developer.android.com/reference/android/hardware/camera2/CaptureRequest#CONTROL_ZOOM_RATIO

## Android 1.7.1 — physical-lens startup fix

Physical capture requests now include their physical camera ID when creating the builder, as required for per-physical zoom keys. Preview readiness waits for the first completed camera frame, with a bounded startup timeout. Closing or failing the camera hides its retained TextureView frame so stale imagery cannot appear behind an inactive-camera message. Optional non-finite exposure metadata is sanitized before JSON serialization, and logical request controls use their logical camera capabilities. Error text has an opaque background and includes the exception type for diagnosis.

Validation: Java metadata regression checks, ten existing TypeScript geometry/alignment tests, TypeScript compilation, native Android build and APK signature verification. No physical Samsung device test was available.
