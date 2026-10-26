# Android release signing

Both Flutter apps load private signing settings from their own
`android/key.properties`. Relative `storeFile` paths resolve from `android/`.
The committed `key.properties.example` files contain placeholders only.
Release tasks fail clearly when configuration or the referenced key is missing;
debug builds keep Flutter's normal debug signing.

## This computer

Configured on 26 October 2026:

| App | Private key relative to its Android directory | Alias | Identity |
| --- | --- | --- | --- |
| Customer (`mobile`) | `signing/selfx-mobile-release.p12` | `selfx-mobile` | Separate RSA 4096-bit release key |
| Kiosk (`kiosk`) | `signing/selfx-kiosk-legacy.p12` | `selfx-kiosk` | Original kiosk certificate, preserved for installed APK compatibility |

Each private configuration contains the matching passwords and
`storeType=PKCS12`. No key or password is committed, copied into Flutter assets,
or included in Docker build contexts. Back up **both the key and its matching
key.properties file** in private credential/backup storage. Restore these files
on another build computer before building; Git alone does not restore them.
Keep the same signing identity for subsequent updates.

The existing kiosk release APK inspected for this setup was signed with an
Android Debug certificate. Its matching private key was found locally and
imported into a separate password-protected PKCS12 file without modifying the
original debug keystore. Its certificate SHA-256 is unchanged:

`804DD62B0212F66547D21E2F2A8DC69D74F56B64488B8D8B33901D16E492E845`

This explicitly preserves the legacy kiosk identity; release builds do not
silently fall back to Flutter's debug key. The restored certificate remains a
debug certificate and is not suitable for Google Play publication. A future
kiosk production-signing migration needs a separate compatibility/distribution
decision and must not silently replace the installed identity.

The customer app uses a new release identity. An installed debug-signed copy
cannot be updated directly with that release key; uninstall that development
copy before the first release installation. Subsequent releases must retain
the new release key. Increase the build number for app updates.

Public customer release fingerprints for native OAuth setup:

- SHA-1: `C8:44:B4:19:57:6A:C2:68:42:A7:6B:E4:24:51:34:12:F2:F3:A6:FC`
- SHA-256: `AF:7F:71:85:B9:7B:17:54:12:95:6F:96:71:F4:0D:05:C2:67:69:69:19:99:5F:A9:28:93:FF:8F:9D:05:3E:74`

Register the release fingerprint/client in Google before testing release Google
sign-in. This setup does not change OAuth configuration, backend activation or
automatic in-app updates.

## Verify without creating an APK

From each app's `android/` directory:

```powershell
.\gradlew.bat :app:validateSigningRelease :app:signingReport
```

The signing report shows public certificate fingerprints, not passwords.

When an APK build is requested, run from the corresponding Flutter app folder:

```powershell
flutter build apk --release --split-per-abi
```

This configuration work does not rebuild or modify existing APKs.

Verified on 26 October 2026: both apps passed Gradle's
`:app:validateSigningRelease` and `:app:signingReport` tasks. The restored kiosk
certificate matches both the existing universal release APK and the ARM64 split
release APK. The earlier customer release APK is unsigned and must be rebuilt
using the new configuration. Missing-configuration and missing-file guards were
inspected in both Gradle scripts. No APK packaging tasks ran.
