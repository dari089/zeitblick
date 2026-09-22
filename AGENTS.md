# Zeitblick — Projektvereinbarungen

- Die Android-App ist das Hauptprodukt. Keine Website veröffentlichen, solange der Nutzer das nicht ausdrücklich wünscht.
- Der Nutzer hat am 22.09.2026 autorisiert, den gesamten Projektcode einschließlich vorhandener Versionsgeschichte und alter APK-Versionen in ein neues privates GitHub-Repository seines Kontos dari089 zu übertragen. Die Erstanlage ist noch offen; vor einem erneuten Anlegen zuerst prüfen, ob sie inzwischen erfolgt ist.
- Künftige abgeschlossene Änderungen an Zeitblick sollen ebenfalls in diesem Nutzer-Repository gesichert werden, sobald die Verbindung eingerichtet ist. Nicht behaupten, dass unverbundene Arbeitsumgebungen oder andere Chats automatisch synchronisieren.
- Nach einer neuen App-Version: prüfen, committen, auf GitHub pushen, passenden vX.Y.Z-Tag setzen und die signierte APK als Release-Anhang hochladen. Versionsnummern aus dem Android-Manifest verwenden. Bestehende Tags und Releases nicht überschreiben.
- Signaturschlüssel, Zugangsdaten, private Bilder, node_modules und lokale Build-Verzeichnisse gehören nicht in das Repository oder Releases. Den vorhandenen privaten Signaturschlüssel für APK-Updates wiederverwenden.
- releases/index.json dokumentiert die zehn bei der Übergabe vorhandenen Original-APKs samt Prüfsummen und zugehörigen Quellcode-Commits. Eine frühere APK 1.0.0 wurde bei dieser Übergabe nicht gefunden; keine historische Binärdatei erfinden.
- Persönliche Ansprache auf Deutsch mit Du. Keine physischen Android-Tests behaupten, wenn nur Browser-Fixtures oder Kompilierung geprüft wurden.
