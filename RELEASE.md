# Release checklist

Status of this build. Items are marked by what was actually run here, not by what a store listing might imply.

## Verified in this environment

- [x] TypeScript strict check (`npx tsc --noEmit`)
- [x] Laws tests: six-tackle handover, forward pass, knock-on, six again, try, held up, conversion, field goal, hooter, golden point, tackle grading, fatigue, interchanges, last-tackle kick choice
- [x] One full AI-versus-AI match completes with 13 players a side and no hard simulation faults
- [x] Save parser rejects corrupt JSON and unknown versions; ladder records a result once
- [x] Production bundle (`npm run build`) when the release step below is green

## Not verified

- [ ] Physical iPhone, iPad, or Android device
- [ ] App Store or Google Play binary, signing, or store review
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

## Before a native store build

- Port the `src/sim` module into the chosen engine, or wrap this site in a web view only as an explicit product decision.
- Replace procedural animation with licensed motion if the visual bar is a console rugby game.
- Profile 26 moving players on the oldest phone you intend to support.
- Keep fictional branding unless rights are signed.
- Do not add gambling, paid random rewards, or ads over live play without a separate compliance review.
