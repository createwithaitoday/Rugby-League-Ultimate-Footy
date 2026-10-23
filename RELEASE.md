# Release checklist

Status of this build. Items are marked by what was actually run here, not by what a store listing might imply.

## Verified in this environment

- [x] TypeScript strict check (`npx tsc --noEmit`)
- [x] Laws tests: six-tackle handover, forward pass, knock-on, six again, try, held up, conversion, field goal, hooter, golden point, tackle grading, fatigue, interchanges, last-tackle kick choice
- [x] One full AI-versus-AI match completes with 13 players a side and no hard simulation faults
- [x] Save parser rejects corrupt JSON and unknown versions; ladder records a result once
- [x] Production bundle (`npm run build`) when the release step below is green
- [x] Signed Android App Bundle `com.ultimatefooty.meridian` versionCode 1, versionName 0.9.0, `minSdkVersion` 24, `targetSdkVersion` 36, `compileSdkVersion` 36. `jarsigner` reported the bundle verified. The bundle contains the match assets and `privacy/index.html`. It does not request the internet permission. That bundle was built before the menu banner.
- [x] Signed Android App Bundle `com.ultimatefooty.national` versionCode 1, versionName 0.9.0, same SDK levels. `jarsigner -verify` reported the bundle verified. The merged manifest requests `INTERNET` and includes the AdMob app id. Play Console accepted it on the Lounge Lizard production draft as version 1 (0.9.0), API 24+, target SDK 36.

## Not verified

- [ ] Physical iPhone, iPad, or Android handset
- [ ] Android emulator playthrough. An Android 36 emulator process started in this environment and stayed offline, so the bundle was not installed or played there.
- [ ] Google Play approval or a public store release. The Lounge Lizard production changes were sent for review on 24 October 2026 (Australia/Sydney). Google has not approved them.
- [ ] App Store binary
- [ ] Sustained thermal or frame-time profile on mid-range phones
- [ ] Online multiplayer (not implemented)
- [ ] Motion-capture animation (not in the project)
- [ ] Licensed clubs, players, or competitions (the game uses fictional ones on purpose)

## Implemented

- Deterministic 13-a-side match, six-tackle sets, play-the-ball, kicks, scoring, restarts, clock, halves, golden point
- Tactical styles that change AI weights
- Touch and keyboard controls, three cameras, try replay, scoreboard, ten-metre line
- Eight fictional clubs, eight stadiums, quick match, four drills, season, career, local saves
- Synthesised crowd, whistle, contact, and kick tones, each with a volume control

## Known limits

- Browsers without WebGL get a flat pitch instead of the 3D stadium. Laws and controls are the same.
- Procedural limbs are readable, not broadcast motion capture. Feet can skate and joints are approximate.
- A dropped ball or a crowded in-goal can still look messy. The safety timer records a fault if play stalls.
- Reloading the page drops the live match. Season, career, and settings survive.
- Background season simulation runs on the main thread in short slices. A match that fails to finish is not written into the table.
- No advantage period. Encroachment is six again once a non-marker is inside 6.2 m.
- Weather changes kick error and ball drift. It does not change the pitch mesh.

## Android package

The Play artifact is a WebView wrapper around this site, package `com.ultimatefooty.national`. It is not a Vulkan or Unity port. Build it with `bash scripts/android-bundle.sh` after installing Android SDK platform 36. The upload keystore is not in git. A new upload key for this package is on this computer. Back up `android/upload-keystore.jks` and `android/keystore.properties` outside the repo. Play fixes the app signing key when the release is published to an open track.

## Play Console and AdMob

The store app is on the Lounge Lizard account, not Vanta Works. Created 23 October 2026 (Australia/Sydney).

- Play developer account: Lounge Lizard, personal account ID `6155776633763969971`
- Play app name: National Rugby: Ultimate Footy (the console field stops at 30 characters)
- In the app, the title is National Rugby League: Ultimate Footy
- Package: `com.ultimatefooty.national`
- Play app ID: `4975315416532968875`
- It is a free game, default language English (United States)
- Dashboard: https://play.google.com/console/u/2/developers/6155776633763969971/app/4975315416532968875/app-dashboard
- Production release 1 (0.9.0) was saved and sent for review on 24 October 2026 (Australia/Sydney). Publishing overview says the changes are in review, including a full rollout. Managed publishing is off, so an approval publishes the app. The dashboard shows production as active, update status In review, and 177 countries and regions. The review submission also adds rest of world. The only release message left was a non-blocking warning: version code 1 has no deobfuscation file. This WebView app is not obfuscated with R8, so no mapping file was uploaded.
- The default store listing uses the 30-character Play name. The full description uses National Rugby League: Ultimate Footy and says the clubs are fictional and this is not an official National Rugby League app.
- The same review includes the privacy policy URL, the ads declaration, the content rating, target audience 13 and older, data safety, the health declaration, and the Sports game category. Data safety says the app collects and shares device or other IDs for advertising, the data is encrypted in transit, there is no account, and there is no deletion request because the developer does not hold that identifier.
- The submission also records Google Play Games on PC as opted in under form factors.

An earlier draft on Vanta Works, account `7394745556354570699`, app ID `4973944636268976391`, used package `com.ultimatefooty.meridian`. That package is already registered and cannot be reused. The Vanta Works app was not the one uploaded for this listing.

AdMob is on the same Google account as that Vanta Works Play developer account. Payment country is Australia. The payment profile is still incomplete, so AdMob will not review the app until that is finished.

- Publisher ID: `pub-5343512610086636`
- AdMob app: Rugby League: Ultimate Footy, Android
- AdMob app ID: `ca-app-pub-5343512610086636~3022193589`
- Banner ad unit: Menu banner, `ca-app-pub-5343512610086636/1993017095`
- App settings: https://admob.google.com/v2/apps/3022193589/settings

The Android app requests that banner on menus and hides it during a live match. The browser game does not load it. The `com.ultimatefooty.national` bundle requests `INTERNET`. The older `com.ultimatefooty.meridian` bundle was built before the banner and does not.

The Play package is not linked in AdMob yet. AdMob's store search only returns apps that are publicly listed, and this Play app is in review, not public. App store details are empty. Use Add store after the listing is public. New units can take up to an hour before they serve a live ad.

## Before a native store build

- The current store artifact wraps this site in a WebView. A later port can move `src/sim` into another engine without rewriting the laws.
- Replace procedural animation with licensed motion if the visual bar is a console rugby game.
- Profile 26 moving players on the oldest phone you intend to support.
- Keep fictional branding unless rights are signed.
- Do not add gambling, paid random rewards, or ads over live play without a separate compliance review.
