# Release checklist

Status of this build. Items are marked by what was actually run here, not by what a store listing might imply.

## Verified in this environment

- [x] TypeScript strict check (`npx tsc --noEmit`)
- [x] Laws tests: six-tackle handover, forward pass, knock-on, six again, try, held up, conversion, field goal, hooter, golden point, tackle grading, fatigue, interchanges, last-tackle kick choice
- [x] One full AI-versus-AI match completes with 13 players a side and no hard simulation faults
- [x] Save parser rejects corrupt JSON and unknown versions; ladder records a result once
- [x] Production bundle (`npm run build`) when the release step below is green
- [x] Signed Android App Bundle `com.ultimatefooty.meridian` versionCode 1, versionName 0.9.0, `minSdkVersion` 24, `targetSdkVersion` 36, `compileSdkVersion` 36. `jarsigner` reported the bundle verified. The bundle contains the match assets and `privacy/index.html`. It does not request the internet permission.

## Not verified

- [ ] Physical iPhone, iPad, or Android handset
- [ ] Android emulator playthrough. An Android 36 emulator process started in this environment and stayed offline, so the bundle was not installed or played there.
- [ ] Google Play review or a public store release
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

The Play artifact is a WebView wrapper around this site, package `com.ultimatefooty.meridian`. It is not a Vulkan or Unity port. Build it with `bash scripts/android-bundle.sh` after installing Android SDK platform 36. The upload keystore is not in git.

## Play Console and AdMob

Created 22 October 2026 (Australia/Sydney) on the Vanta Works account.

- Play developer account: Vanta Works, ID `7394745556354570699`
- App name: Rugby League: Ultimate Footy
- Package: `com.ultimatefooty.meridian`
- Play app ID: `4973944636268976391`
- Listing status: Draft. It is a free game, default language English (United States)
- Dashboard: https://play.google.com/console/u/0/developers/7394745556354570699/app/4973944636268976391/app-dashboard

AdMob is on the same Google account as that Vanta Works Play developer account. Payment country is Australia. The payment profile is still incomplete, so AdMob will not review the app until that is finished.

- Publisher ID: `pub-5343512610086636`
- AdMob app: Rugby League: Ultimate Footy, Android
- AdMob app ID: `ca-app-pub-5343512610086636~3022193589`
- App settings: https://admob.google.com/v2/apps/3022193589/settings

The Play package is not linked in AdMob yet. AdMob's store search only returns apps that are publicly listed, and this Play app is still a draft. App store details are empty. Use Add store after the listing is public.

## Before a native store build

- The current store artifact wraps this site in a WebView. A later port can move `src/sim` into another engine without rewriting the laws.
- Replace procedural animation with licensed motion if the visual bar is a console rugby game.
- Profile 26 moving players on the oldest phone you intend to support.
- Keep fictional branding unless rights are signed.
- Do not add gambling, paid random rewards, or ads over live play without a separate compliance review.
