# Rugby League: Next Generation

An original 13-a-side rugby league match. Fictional clubs play in the Meridian Cup. The laws live in a deterministic simulation. Three.js draws the stadium, the players, and the ball on top of that simulation.

This is a browser game. It runs on a phone or a desktop browser, including iPhone Safari and Android Chrome, and it can be installed as a home-screen app. It is not a native App Store or Google Play binary, and it does not use Metal or Vulkan. Unity, Unreal, and Godot were not available in this environment, so the match was not built in those editors. The simulation is plain TypeScript and can move to a native engine later without rewriting the laws.

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

Keyboard: W A S D or arrows, Shift sprint, J or Space pass, F tackle, K kick, L dive, Tab switch, Enter tap, C camera, Esc pause.

## Layout

- `src/sim/` — rules, tactics, fatigue, interchanges, season table. No rendering.
- `src/data/teams.ts` — fictional squads and stadiums. No real clubs or players.
- `src/render/` — stadium, instanced players, cameras, replay.
- `src/game/` — touch and keyboard input, screens, saves, synthesised audio.
- `tests/` — laws, a full AI match, saves, and the ladder.

Saves use `localStorage` under `meridian-league-save`, with a copy beside it. Version 1 payloads that fail validation are discarded. An in-progress match is not restored after a reload.

## Honest limits

- Player motion is procedural. It is not motion capture.
- Audio is synthesised. There is no commentary track. Event text only describes things the simulation emitted.
- There is no online multiplayer. “Simulate” is the AI match engine, not a network game.
- No payments, ads, or random paid rewards.
- Crowd figures are instanced heads, not individual people.
- The game has not been tested on a physical iPhone or Android device in this project.
- Advantage, sin bins, and a video referee that can overturn the simulation are not implemented. The whistle is immediate.
- Graphics quality settings change pixel ratio and crowd density. They are not a profiled 60 fps guarantee.
