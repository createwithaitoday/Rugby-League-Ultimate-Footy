# National Rugby League: Ultimate Footy

An original 13-a-side rugby league match. Fictional clubs play in the Meridian Cup. The laws live in a deterministic simulation. Three.js draws the stadium, the players, and the ball on top of that simulation.

This is a browser game. It runs on a phone or a desktop browser, including iPhone Safari and Android Chrome, and it can be installed as a home-screen app. The Android package is that same game inside a WebView: `scripts/android-bundle.sh` produces a signed Android App Bundle with `targetSdkVersion` 36 (Android 16). It does not use Metal or Vulkan, and it is not a Unity, Unreal, or Godot project. The simulation is plain TypeScript.

If the browser cannot create a WebGL context, the same match is drawn on a flat pitch instead of a 3D stadium. The laws, teams, and controls stay the same.

## Play

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8741`.

```bash
npm test
npm run build
```

`npm run build` typechecks and writes a static site to `dist/`. `npm run preview` serves that site on the same port.

## Android bundle

The Play package id is `com.ultimatefooty.national`. Version name `0.9.0` is version code 1. `android/variables.gradle` sets `compileSdkVersion` and `targetSdkVersion` to 36, and `minSdkVersion` to 24.

```bash
export ANDROID_HOME="$HOME/android-sdk"   # SDK with platforms;android-36 and build-tools;36.0.0
# android/keystore.properties and android/upload-keystore.jks are local signing files.
# They are gitignored. Keep a copy of the upload key; Play updates need the same key.
bash scripts/android-bundle.sh
```

The signed bundle is written to `android/app/build/outputs/bundle/release/app-release.aab`. The script refuses to build a release if `android/keystore.properties` is missing, so a bundle from this script is not silently signed with the debug key.

The privacy policy shipped in the app is `public/privacy/index.html`. The same text is in `docs/index.html`, and GitHub Pages serves it from the `main` branch (`/docs`) at https://createwithaitoday.github.io/Rugby-League-Ultimate-Footy/.

## What you can do

- Quick match: pick two of the eight fictional clubs, a weather setting, and kick off.
- Play the ball carrier on attack. Up the screen is always your try line, including after half-time.
- Pass, kick (punt, grubber, bomb, chip, touch finder, aimed field goal), sprint, and dive.
- On defence, move a defender, tackle, and switch to the next nearest teammate.
- Six-tackle sets, play-the-ball, markers, handovers, scrums, tries, held-up drop-outs, conversions, penalty goals, and golden-point extra time.
- Training drills for passing, tackling, goal kicking, and the last tackle.
- A season: one round-robin, then 1v4 and 2v3 and a final. Other fixtures can be simulated with the same engine.
- A career player with saved attributes, match totals, and a few achievements.
- Settings for difficulty, half length, clock speed, graphics, camera, handedness, and volume. Movement stays in real time. Clock speed only moves the match clock.

Keyboard: W A S D or arrows, Shift sprint, J or Space pass, Q next receiver, F tackle, K kick, L dive, Tab switch, Enter tap, C camera, Esc pause. With the ball, the pitch shows the pass the simulator would release. A hard push toward the attack line still sends the ball into space. Open the kick menu to preview that kick, including wind, touch, and a charge-down.

## Layout

- `src/sim/` — rules, tactics, fatigue, interchanges, season table. No rendering.
- `src/data/teams.ts` — fictional squads and stadiums. No real clubs or players.
- `src/render/` — stadium, instanced players, cameras, replay.
- `src/game/` — touch and keyboard input, screens, saves, synthesised audio.
- `tests/` — laws, a full AI match, saves, and the ladder.

Saves use `localStorage` under `meridian-league-save`, with a copy beside it. Version 1 payloads that fail validation are discarded. An in-progress match is not restored after a reload.

## Honest limits

- Players are original human meshes with kit, numbers, and blended poses under stadium lighting. They are not scanned athletes or footage from another game, and the pass line is a preview of this game's ball step, not a guaranteed catch.
- Audio is synthesised. There is no commentary track. Event text only describes things the simulation emitted.
- There is no online multiplayer. “Simulate” is the AI match engine, not a network game.
- No payments or random paid rewards. The Android app can show an AdMob banner on menus and hides it during a live match. The browser game does not load ads.
- Crowd figures are instanced heads, not individual people.
- The game has not been tested on a physical iPhone or Android handset in this project. The Android package is the browser game in a WebView.
- Advantage, sin bins, and a video referee that can overturn the simulation are not implemented. The whistle is immediate.
- Graphics quality settings change pixel ratio and crowd density. They are not a profiled 60 fps guarantee.
