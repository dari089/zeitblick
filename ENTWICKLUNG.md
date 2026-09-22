# Zeitblick selbst weiterentwickeln

Aktueller Stand: Android 1.7.0, Paket `de.zeitblick.kamera`.

## Wo ist welcher Code?

- `app/page.tsx`: Foto-Kamera, Overlay, Linsen- und Zoomsteuerung.
- `app/globals.css`: Oberfläche und Layout.
- `components/alignment-editor.tsx` und `lib/alignment*`: automatische/manuelle Bildausrichtung und Export.
- `components/video-workspace.tsx` und `lib/video-tools.ts`: Video-Kamera, Overlay und Vergleich.
- `mobile/native/src/de/zeitblick/kamera/`: Android-Code in Java, Camera2, Galerieauswahl und Speichern.
- `mobile/native/AndroidManifest.xml`: Berechtigungen, Paketname und Versionsnummer.
- `mobile/vite.config.ts` und `mobile/build-apk.py`: lokaler Frontend- und APK-Build.
- `tests/`: Geometrieprüfungen und Browser-Testseiten mit simulierten Kameraquellen.
- `public/alignment/` und `vendor/`: mitgelieferte Algorithmen und deren Lizenzhinweise.

Die Android-App enthält ihre Oberfläche lokal. Für den APK-Build sind weder eine veröffentlichte Website noch ein ChatGPT-Konto nötig. Zusätzliche Web-/Sites-Dateien stammen vom ursprünglichen Webprojekt.

## Voraussetzungen

Verwende Linux oder WSL, Node.js ab 22.13, pnpm in der in `package.json` angegebenen Version, Python 3, Java 17, Android SDK Build Tools 35.0.0, Android SDK Platform 35 und eine Eclipse-ECJ-JAR, die unter Java 17 läuft. SDK und ECJ werden separat installiert und nicht mit dem Quellcode ausgeliefert.

## Frontend installieren und bauen

Im Projektordner:

```sh
pnpm install --frozen-lockfile
node node_modules/vite/bin/vite.js build --config mobile/vite.config.ts
```

Für lokale Arbeit an der Oberfläche:

```sh
node node_modules/vite/bin/vite.js --config mobile/vite.config.ts
```

Die Browseransicht ersetzt keinen Test der nativen Camera2-Funktionen auf dem Handy.

## APK bauen

Passe die fünf Pfade an deinen Rechner an:

```sh
python3 mobile/build-apk.py \
  /pfad/android-sdk/build-tools/35.0.0 \
  /pfad/android-sdk/platforms/android-35/android.jar \
  /pfad/ecj.jar \
  /privater/pfad/zeitblick-test.keystore \
  /pfad/ausgabe/Zeitblick.apk
```

Das Script kompiliert Java, erstellt die APK und überprüft ihre Signatur. Die aktuelle Build-Konfiguration verwendet den Testalias `androiddebugkey` und das Testpasswort `android`. Wenn am angegebenen Pfad kein Schlüssel liegt, erzeugt das Script einen neuen.

**Für Updates deiner bereits installierten App brauchst du den bisherigen Signaturschlüssel.** Ein neuer Schlüssel kann diese Installation nicht aktualisieren. Der bisherige Schlüssel gehört in eine getrennte, private Sicherung und nicht ins GitHub-Repository. Mit einem anderen Schlüssel wäre eine Neuinstallation nötig; vorher lokale Entwürfe sichern.

Für eine neue Version `versionCode` erhöhen und `versionName` im Manifest anpassen. Danach den Frontend-Build und APK-Build erneut ausführen.

## Prüfen

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/capture.test.mjs tests/video.test.mjs tests/alignment.test.mjs
```

Echte Linsen, Orientierung, Zoom, HEIC-Auswahl und Galeriespeicherung zusätzlich auf dem Android-Gerät testen. Die Browser-Testseiten simulieren Teile der Kamera und der Android-Schnittstelle.

## GitHub-Aufteilung

Der Quellcode samt Tests, Konfiguration und Lizenzhinweisen gehört ins Repository. Die fertige APK eignet sich als Download-Anhang eines Releases. `node_modules`, Build-Ausgaben, private Fotos, Zugangsdaten und Signaturschlüssel werden nicht hochgeladen. Abhängigkeiten werden aus dem Lockfile installiert.
