# Zeitblick

Mobile-first overlay camera. Choose a local reference image, align it over live camera video, and capture a JPEG with or without the reference.

## Behavior

- Reference opacity 0–100%, independent preview visibility and export inclusion.
- Reference excluded from photos by default. Grid, framing corners and interface controls never enter the image renderer.
- Touch drag, two-finger zoom, scale and rotation sliders, keyboard positioning and position lock.
- The viewfinder follows the reference aspect ratio. Export uses the same centered crop and coordinate transform as the preview.
- Camera permission requested on explicit start. Audio is never requested. Camera tracks stop on page exit and on stop/switch.
- References and captures are processed locally and kept in memory until reload. No media uploads, analytics or advertising.
- Photo review, device share/save and explicit JPEG download.
- Web app manifest and home-screen icons. Internet access is needed to load the app; offline operation is not promised.

## Validation

- `node --experimental-strip-types --test tests/capture.test.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- Sites build script.
- Browser checks cover rendering and local image import. Physical camera capture and operating-system save/share require device testing on HTTPS.
- Optional WebMCP registration is feature-detected. The available browser context does not expose modelContext, so runtime WebMCP validation is unavailable.

## Development

Use the existing pnpm lockfile and Sites scripts. The local execution profile selects the compatible preview/build flow.
