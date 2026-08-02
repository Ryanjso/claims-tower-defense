# Containment

A Bloons-style tower defense game about health plan cost containment, built for
[Yuzu Health](https://yuzu.health). The balloons are medical claims. The towers are the
strategies a TPA actually uses to keep those claims off the plan.

Twenty rounds, 250 covered lives, thirteen claim types from an $80 lab panel to a
$3.2M gene therapy.

## The central idea

Claims are not destroyed, they are **repriced**. A tower hit knocks a claim down the
ladder into cheaper claims — an inpatient admission becomes two outpatient surgeries,
which become specialty infusions, and so on. "Contained" means the allowed amount
reached zero. Anything that reaches the end of the path is paid by the plan, and
costs you covered lives.

"Lives" is not a metaphor borrowed from games. In insurance a covered life *is* a
member, which is why the loss condition reads the way it does.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static bundle in dist/
npm test           # sim + data invariants (vitest)
```

## Layout

```
src/
  game/
    data/          all balance numbers live here — claims, towers, rounds, zones
    sim/           headless simulation: Path, Sim, placement
    render/        placeholder art generation
    scenes/        Phaser preload + game scene
    EventBus.ts    React -> Phaser commands
  state/store.ts   Phaser -> React state (zustand)
  ui/              HUD, shop, inspector, round bar, claim ladder, scorecard
scripts/
  trace-path.mjs      extracts the path centreline from the map PNG
  trace-terrain.mjs   extracts the tower-placement mask from the map PNG
  balance.ts          headless balance harness
  playthrough.mjs     end-to-end browser run (Playwright)
```

The simulation in `src/game/sim/Sim.ts` imports no Phaser. That is what lets the
balance harness play thousands of rounds a second with no renderer, and it is why
the sim is unit-testable.

React owns the DOM chrome; Phaser owns the canvas. Commands flow one way through
`EventBus`, state flows back through the zustand store, so UI work never blocks the
render loop.

## Map data is generated, not hand-authored

Both the claim path and the buildable-ground mask are extracted from
`public/assets/map/field.png` by analysing pixels:

```bash
npm run map:build
```

- **`trace-path.mjs`** classifies low-saturation bright pixels as stone, keeps the
  largest connected component, then runs a distance-weighted Dijkstra from spawn to
  exit so the route follows the middle of the corridor rather than cutting corners.
  Output: 116 waypoints over 3,639px of path.
- **`trace-terrain.mjs`** marks a 16px cell buildable only if it is predominantly
  open grass, which rules out the path, trees, rocks and the hospital buildings in
  one test. A majority-smoothing pass removes the speckle that flowers and grass
  tufts would otherwise leave.

To check either one visually:

```bash
node scripts/trace-path.mjs --ascii
node scripts/trace-terrain.mjs --debug /tmp/terrain.png   # blue tint = blocked
npx tsx scripts/verify-path.mjs /tmp/path.png             # magenta = centreline
```

Swap in a different map PNG, re-run `npm run map:build`, and the game adapts.

## Swapping in real artwork

The game ships with generated placeholder sprites — hexagonal tower plates and
coloured claim tokens, drawn to canvas at boot. To use real art:

1. Drop PNGs into `public/assets/towers/<towerId>.png` or
   `public/assets/claims/<claimId>.png`.
2. List those ids in `public/assets/manifest.json`.

Anything listed wins; anything omitted keeps its placeholder. Nothing in the
renderer changes. The manifest is fetched once, so a placeholder-only build makes
no failing requests.

Originals live in `audio-src/`; `scripts/encode-audio.sh` produces what actually
ships into `public/assets/audio/`. AAC rather than MP3, because at these bitrates
Apple's encoder is well ahead of any MP3 encoder and every browser's
`decodeAudioData` handles it. Effects collapse to mono — none of them are
positioned, so stereo would double both their size and their decoded memory for
no audible difference — while the music stays stereo. That takes the set from
1,358KB to 455KB. Only 74KB of it loads at startup: the music is five times
every effect combined and cannot play before the page is interacted with, so it
is fetched on idle after the map rather than competing with it.

Sound effects are registered in `src/audio/sfx.ts`, which both the React chrome and the Phaser scene call. It is
deliberately not Phaser's sound manager: the sidebar needs to click too, and
routing every menu press through the command bus into the canvas would be a lot
of indirection for a 10KB sample. Samples are fetched up front but only decoded
on first play, so no AudioContext exists until the page has been interacted
with, and every call no-ops on a missing or undecodable file.

Each sample carries its own gain plus optional limits: `solo` cuts off a
still-ringing instance, `minInterval` sets a floor between starts, `maxVoices`
caps how many ring at once, and `detune` jitters playback rate so repeats do not
sound looped. The claim-impact tear needs all of them — round 20 breaks claims
321 times a second, and 64 times in a single frame, so the scene coalesces a
frame's impacts into one call and the limits do the rest. Measured, that turns
1,146 impacts into 31 tears over twelve seconds while round 5 turns 40 into 15,
so the texture thickens with pressure instead of turning to mush.

Tower fire is the opposite case: it peaks at ten shots a second, so it plays on
every one. It needs no floor at all — an interval floor of even 17ms silently
halved it, because frames land 16.7ms apart at 60Hz.

The leak alarm sits between the two: occasional leaks all buzz, but a collapsing
board caps at three a second so the warning stays a warning rather than becoming
a drone. It is the only sound in the game that means something went wrong, so it
is also the loudest.

A looping music bed plays under all of it at low gain. It bypasses the
compressor and goes straight to the master, so a busy round does not pump the
backing track. Browsers will not start audio before the page is interacted with,
so the loop is scheduled against the still-suspended context and plays from the
top the instant a gesture arrives.

Effects route through one compressor. Late in a round a dozen gunshots and
several tears ring at once, and summing that many voices would clip on peaks.
Holding the ceiling centrally means no individual sound has to be quiet enough
to be safe in the worst case.

Adding a sound is two steps: drop the file in `public/assets/audio/` and add a
key to `SOUNDS`.

Sound only ever confirms something that happened. A build click refused for
being on the path, or an upgrade you cannot afford, stays silent.

The Sound toggle in the round bar mutes music and effects together through a
single master gain, and remembers the choice in localStorage. Always-on audio
with no off switch is not something to ship on a page someone opens from a
link.

Tower ids: `network` `ncci` `careNav` `rbp` `planDesign` `accumulator` `cashPay`
`directContract` `tracy` `stopLoss`

Claim ids: `lab` `officeVisit` `therapy` `urgentCare` `imaging` `emergency`
`specialtyDrug` `outpatientSurgery` `airAmbulance` `inpatient` `bundle` `nicu`
`geneTherapy`

## Balance

`scripts/balance.ts` plays all twenty rounds headlessly with four scripted players,
each committing to a different strategy, and reports where each one ends up.

```bash
npm run balance                    # one run, round-by-round table
npm run balance -- --sweep         # strategy x economy matrix
npm run balance -- --late-sweep    # strategy x late-round difficulty
npm run balance -- --plan pricing --verbose
```

At the shipped numbers every strategy clears round 20, with margins spread from
121 to 250 of 250 lives. Drop the economy 10% and two of the four fail, so there is
no slack in the tuning. The scripted players place and spend better than a person
will, so a real run is harder than the table suggests.

`scripts/tower-value.ts` answers the other balance question: what a single tower
is worth per dollar. It gives every type the same budget and places it alone,
which a full-board run cannot tell you — on a shared board a tower can read as
useless purely because a faster neighbour reaches the claims first. The sim
tracks `damageBy` per tower type to support it.

Three tuning lessons are baked into the data and worth not undoing:

- **Spike counts are a kill counter, not a damage number.** Early claims have one
  hit point, so every spike *hit* is a kill regardless of the damage value, and
  spikes persist. NCCI Edits originally banked 54 kills on the path for $350,
  which is an entire early wave, and a single unupgraded one lost just 12 lives
  across the first eight rounds where a Network lost 240.

- **Pop payouts stay small; the round bonus carries the budget.** Income from
  breaking claim layers scales with how deep a claim's cascade runs, which means it
  explodes exactly when waves get hard. Leaning on it let late rounds fund the
  defence that trivialised them.
- **Leak costs are authored, not summed over the cascade.** Deriving them
  recursively made one leaked NICU stay cost 559 of the player's 250 lives, turning
  every catastrophic round into pass-or-instantly-lose.

## Verifying in a browser

```bash
npm run dev &
node scripts/playthrough.mjs      # auto-plays 20 rounds, reports FPS and errors
node scripts/shoot.mjs            # screenshots to /tmp/shots
npx tsx scripts/perf.ts           # times the sim alone on round 20
```

`perf.ts` exists to separate the two costs. The sim runs round 20 at 0.01ms per
tick with a peak of ~60 live entities, so any frame-rate problem is the renderer,
not the simulation.

## Design notes

**Towers map to real mechanics.** Which claims a tower can even see is not a balance
knob, it is a fact about the strategy. NCCI edits genuinely cannot touch a cleanly
coded claim. A cash pay card genuinely does not care whether the provider is in
network, because the claim never enters adjudication. Stop-loss genuinely does
nothing until the specific deductible attaches. The counterplay teaches the domain
because it was derived from it.

**The game explains itself the first time something bites.** Before a round the
player has no answer to, a briefing says what is coming, why it is hard in real
terms, and which towers address it — see `src/game/data/briefings.ts`. It fires
only where a capability is genuinely missing, not merely under-optimised, and
only once per threat per run. Own something that answers it and it never
appears — and buying that tower while the memo is open dismisses it without a
click.

The gate lives in `GameScene`, not in React. Auto-start fires in the same frame
a round ends, so a flag React set after rendering would always arrive too late,
and the memo just flashed. It holds the *automatic* queue only: the board and
shop stay live underneath, and pressing start yourself always works and counts
as having read it. The three that qualify are out-of-network claims, which most towers
cannot see; cleanly coded claims, which coding edits slide off; and the first
catastrophic claim, which chip damage will not finish.

**No single strategy wins.** Pricing without navigation leaves volume untouched.
Navigation without stop-loss leaves you exposed to the one claim that matters. The
balance matrix exists partly to keep that true.

**The interface is made of the subject's own materials.** The chrome is a
clipboard of claim paperwork propped beside the map: kraft board, manila card
stock, typed form fields, rubber stamps. Buying a strategy means taking a card
off a clipped stack; finishing a run gets a verdict stamped on it. Yuzu's coral
and teal survive intact but arrive as stamp ink and seal rather than as accent
fills on a dark panel. Baloo 2 is the game's speaking voice, Courier Prime is
the paperwork's. Paper fibre and board tooth are SVG turbulence, so all of it is
CSS with no image assets.

**Claim traits are the Bloons modifiers, renamed honestly.** Out-of-network is camo,
cleanly coded is lead, balance-billed is regrow, prior-authorised is fortified.
