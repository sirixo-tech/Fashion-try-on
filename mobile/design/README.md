# Customer branding

The Google sign-in/signup button bundles `assets/branding/google-g.png`, downloaded
unchanged from Google's official asset at
https://developers.google.com/static/identity/images/g-logo.png (2026-10-27).
It uses contained fitting at 20 logical pixels on the existing white button;
do not recolor, redraw or mirror the mark. The localized Continue with Google
label supplies the accessible action name. See
[Google's sign-in branding guidelines](https://developers.google.com/identity/branding-guidelines).

The approved wordmark is copied unchanged from `frontend/web/public/brand/selfx-logo.png` to `assets/branding/selfx-logo.png`. The customer app keeps its own layout and Flutter widgets.

`assets/branding/selfx-mark.png` is an unchanged copy of the user's supplied **Selfx Logo.png**, stored canonically at `frontend/web/public/brand/selfx-mark.png`. Do not regenerate it by cropping/masking the wordmark or redraw it. Native icons use this exact X on the app's cream background; legacy Android and iOS launch screens keep the full wordmark.

From the repository root, regenerate native PNG sizes with:

```powershell
node tools/branding/prepare-app-icons.cjs
```

The script uses the root's existing Sharp dependency and prepares customer Android/iOS icons, Android kiosk icons, the Windows kiosk ICO and the existing web PWA/favicon/Apple touch icons. PWA maskable variants keep the mark inside the safe area. `tool/prepare_brand_assets.cjs` remains a compatible entry point. Flutter does not join npm workspaces.

This command prepares source assets only; it never builds an APK or another application package. The user explicitly requested no APK builds during this update. Existing packages remain unchanged until a later authorized build. Do not substitute generic Flutter/sparkles artwork or a typed wordmark for the logo. Sparkles may still represent Try-On actions/credits.
