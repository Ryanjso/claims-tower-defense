# Sprite Requirements — Containment

**Status: the game ships zero authored sprites.** The only image asset in the repo is
`public/assets/map/field.png`. Every tower, claim, projectile, trap and effect is drawn
procedurally at boot by `src/game/render/art.ts` — coloured hexagons with three-letter
glyphs for towers, coloured discs for claims. This document specifies everything that
needs to be drawn to replace that.

Two behaviours drive the spec and do not exist yet in any form:

1. **Towers swivel to face their target.** Most towers are split into a static `base`
   and a rotating `head`. Tracy and Good Plan Design do not rotate.
2. **Towers have firing animations**, Bloons TD 6 style — a short recoil cycle with the
   muzzle flash baked in, played once per shot, on top of the swivel.

---

## 1. Global art direction

Match `public/assets/map/field.png` exactly. That map is the style reference and
everything sits on top of it.

| Property | Value |
| --- | --- |
| Style | Bright cartoon vector / painted casual-mobile. Think Bloons TD 6, Kingdom Rush, Clash-style readability. |
| Camera | Top-down, ~80° — near vertical with just enough tilt that tall objects show a sliver of their front face. Same tilt as the hospital buildings on the map. |
| Light | Single soft light from the top of the screen. Highlights on upper surfaces, ambient occlusion under overhangs. |
| Outline | 6–8px (at 256px canvas) dark outline in a deeply darkened version of the object's own hue. **Never pure black.** |
| Shading | Soft cel shading, 2–3 tones per surface. No photographic gradients, no lens flare, no bloom baked in. |
| Saturation | High but not neon. Sit alongside the map's grass green (`#7ac943`-ish) without vibrating. |
| Format | PNG-32, straight alpha, transparent background. No baked backdrop, no baked ground disc. |
| Margin | Leave ~8px of transparent bleed on all sides so nothing clips when rotated. |
| Text | Do **not** bake labels or letters into tower or claim art, with the sole exception of the rubber-stamp sprites in §7. Codes like `NCCI` and `DRG` are placeholder-era crutches; the shapes must carry the meaning. |

**Everything must read at 40% scale.** Towers render at roughly 62×62 px on-screen and
the smallest claims at 30×30 px. Silhouette first, detail second.

### Tint safety

The renderer multiplies sprites by a tint colour at runtime:

- Buffed towers get `0xfff0b0`, tier-3 towers get `0xfff8e1` (`GameScene.renderTowers`).
- Claims get trait tints — out-of-network `0xb388ff` at 62% alpha, cleanly-coded
  `0xdfe6ee`, prior-auth `0xffd479`, balance-billed `0xff9e80` (`GameScene.styleClaim`).

Tint is a multiply, so anything authored near-black stays black and anything authored
pure white takes the tint at full strength. Keep midtones in the 35–85% luminance band.
This matters most for the dark claims — **Institutional Bundle, NICU Stay and Inpatient
must be authored noticeably lighter than their listed hex** so the trait tints are still
legible on them.

---

## 2. File layout and technical contract

```
public/assets/
  towers/
    <towerId>/
      t0/base.png          static plate, never rotates
      t0/head.png          horizontal frame strip, rotates + animates
      t1/base.png  t1/head.png
      t2/base.png  t2/head.png
      t3/base.png  t3/head.png
  claims/
    <claimId>.png
  fx/
    <effectId>.png
  ui/
    portrait-<towerId>.png     (optional, §9)
```

`<towerId>` ∈ `network` `ncci` `careNav` `rbp` `planDesign` `accumulator` `cashPay`
`directContract` `tracy` `stopLoss`

`<claimId>` ∈ `lab` `officeVisit` `therapy` `urgentCare` `imaging` `emergency`
`specialtyDrug` `outpatientSurgery` `airAmbulance` `inpatient` `bundle` `nicu`
`geneTherapy`

### Canvas and pivot rules

| Asset class | Canvas per frame | Pivot | Notes |
| --- | --- | --- | --- |
| Tower `base` | 256 × 256 | centre (128,128) | Includes the ground shadow. Renders at ~62px. |
| Tower `head` | 256 × 256 | centre (128,128) | **Barrel points EAST (right, +X).** Rotates about the exact centre. |
| Claim | 256 × 256 | centre | Subject fills ~88% of the frame. Renders at 30–92px depending on tier. |
| FX / projectiles | as listed in §6 | centre | |

**Orientation is non-negotiable: heads are drawn facing right.** The sim computes
`Math.atan2(target.y - t.y, target.x - t.x)` and Phaser's rotation 0 is due east, so a
head drawn pointing up will be 90° wrong on every single shot.

### Sprite strips

Animated heads are a **single horizontal strip**: N frames of 256×256 laid left to right,
so a 4-frame strip is a 1024×256 PNG. Frame 0 is always the idle/rest pose — a tower that
is not shooting displays frame 0 forever. Frames 1..N-1 are the fire cycle, played once
per shot at 24fps and then returning to frame 0.

### Shadows

The ground shadow belongs to the **base only**, baked in as a soft dark ellipse at ~35%
opacity offset a few pixels down-screen. The head must cast no shadow of its own — it
rotates, and a rotating shadow reads as broken. The head may carry a very soft, radially
even contact darkening where it meets the base.

### Base / head split

The base is the part bolted to the ground: platform, footings, sandbags, cabling, the
skirt of the machine. The head is the part that aims: barrel, dish, lens, arm. The head
should overhang the base slightly so the rotation is visible; a head that fits entirely
within the base's silhouette will look static even while spinning.

---

## 3. Which towers swivel

The user requirement, resolved against each tower's `kind` in `src/game/data/towers.ts`:

| Tower | Kind | Swivels? | Turn rate | Fire animation |
| --- | --- | --- | --- | --- |
| `network` | shooter | **Yes** | ~10 rad/s, smooth | 4 frames — barrel kick + paper flash |
| `ncci` | spikes | **Yes, slow** | ~3 rad/s, faces the path segment it stamps | 5 frames — stamp raise, slam, rebound |
| `careNav` | shooter | **Yes** | ~8 rad/s, smooth sweep | 4 frames — beacon flare + arrow launch |
| `rbp` | hitscan | **Yes** | ~14 rad/s, snappy | 4 frames — scope flash, no recoil |
| `planDesign` | aura | **No** | — | 6-frame radial pulse loop, always playing |
| `accumulator` | shooter | **Yes** | ~9 rad/s | 4 frames — drum ratchets one click per shot |
| `cashPay` | instant | **Yes** | ~12 rad/s, snap | 5 frames — card swipe + cash burst |
| `directContract` | shooter | **Yes** | ~9 rad/s | 4 frames — press slams, pen nib recoils |
| `tracy` | buff | **No — never rotates** | — | 6-frame idle loop (breathing / typing) |
| `stopLoss` | barrier → laser | **Yes** | ~7 rad/s (t0–t2), ~16 rad/s (t3) | t0–t2: 4-frame mortar launch. t3: 4-frame lens spin-up, holds on last frame while firing. |

For non-swivelling towers (`planDesign`, `tracy`), deliver the same `base.png` +
`head.png` pair, but the "head" is just the animated upper body drawn at a fixed
orientation — top-down, no implied facing. The renderer will hold its rotation at 0.

---

## 4. Tower sprites

Four tiers each (t0 = as purchased, t1–t3 = the three upgrades). **Each tier must be
visibly, instantly different from the one below it** — bigger, more barrels, more
hardware, richer trim. A player should be able to read a board's upgrade state without
clicking anything. Keep the tier silhouette family recognisable: a tier-3 Network is
still obviously a Network.

Colours below are the tower's authored palette from `towers.ts`. Use `color` as the
dominant body hue and `accent` for trim, shadow planes and the base skirt.

---

### 4.1 `network` — Network · teal `#1b8b8c` / `#115859`

*Contracted discounts off billed charges. Cheap, broad, shallow.*

- **Base:** a low hexagonal teal platform with a dark metal collar, a few coiled cables
  running off one edge, and two small footing bolts. Reads as cheap infrastructure.
- **Head:** a **relay dish** on a short yoke — a shallow parabolic teal dish with a
  darker rim and a stubby feed horn at the centre, pointing east. Small paper chits are
  visible stacked in a hopper on the underside.
- **Fire cycle (4f):** f1 dish flexes forward, bright teal ring flash at the feed horn
  and a chit ejecting; f2 dish kicked back, chit gone; f3 settling; f0 rest.
- **t1 Broader Network:** second smaller dish mounted beside the first, wider yoke.
- **t2 Tiered Network:** three stacked dishes in descending sizes, gold trim ring on the
  base marking the preferred tier.
- **t3 National PPO:** a full white-and-teal radome — enclosed dome with a rotating
  scanner bar visible through a slot, chunkier base with a raised service walkway.

---

### 4.2 `ncci` — NCCI Edits · red `#d44d4a` / `#932d2b`

*Coding edits that catch unbundling and duplicates before payment goes out.*

- **Base:** a red industrial press bed — a heavy rectangular-on-hex plate with an ink
  reservoir tray, an ink-stained pad, and scattered loose staples around the footings.
- **Head:** a **rubber-stamp press arm** — a vertical piston in a red housing with a
  square stamp block on the end of a short arm reaching east over the path. The stamp
  face is dark red rubber, cut with a hatched grid pattern (never a readable word).
- **Fire cycle (5f):** f1 arm raises, piston extends; f2 arm slams down, ink spray
  droplets; f3 impact squash with staple-caltrops flying outward; f4 arm rebounds; f0.
- **t1 Bundling Rules:** twin stamp blocks side by side, bigger reservoir.
- **t2 Modifier Scrutiny:** magnifier lens mounted beside the stamp head, brass fittings.
- **t3 Full Edit Suite:** four-headed rotary stamp turret on a gear ring, pressurised
  ink lines, red warning chevrons on the base.

---

### 4.3 `careNav` — Care Navigation · blue `#4b9fe1` / `#1f5f96`

*Slow claims down and steer members to high-value sites of care.*

- **Base:** a blue hex platform with a **compass rose** painted across it, four cardinal
  points picked out in white, and a small signpost stub at the rear.
- **Head:** a **rotating beacon lamp** — a glass-fronted lantern in a blue housing with a
  chrome reflector behind it, throwing a faint cone east. A small directional arrow fin
  sits on top like a weather vane.
- **Fire cycle (4f):** f1 lamp flares white-blue, a chevron arrow leaves the lens; f2
  lamp at peak brightness, arrow further out; f3 dimming; f0 rest at low glow.
- **t1 Nurse Line:** headset and small handset cradle added to the housing.
- **t2 Steerage Incentives:** a second lamp on a side arm, plus a small coupon/voucher
  dispenser slot on the base.
- **t3 Concierge Navigation:** a full lighthouse-style lantern room with a brass railing,
  twin lenses, and a warm gold accent light — the only warm colour on the model.

---

### 4.4 `rbp` — Reference-Based Pricing · amber `#f0b429` / `#a8760a`

*Ignore the chargemaster. Pay a defensible multiple of Medicare.* **Map-wide range.**

- **Base:** an amber surveyor's **tripod** on a hex pad, legs splayed, with a levelling
  bubble and a rolled benchmark chart strapped to one leg.
- **Head:** a **theodolite / optical transit** — a boxy amber instrument body with a long
  telescopic sight pointing east, a graduated brass measuring ring around the vertical
  axis, and a small eyepiece at the rear.
- **Fire cycle (4f):** f1 sight lens flashes hot white-gold, thin ruler-tick beam
  launches; f2 beam at full length, brass ring lit; f3 lens cooling; f0.
  **No physical recoil** — this is an instrument, not a gun. The flash is the animation.
- **t1 150% of Medicare:** larger objective lens, one extra graduation ring.
- **t2 125% of Medicare:** twin parallel sights, tighter machined body, dark grip.
- **t3 Plan-Determined Allowable:** a legal-grade instrument — polished brass and deep
  amber, a small embossed seal medallion on the side, three sights in a cluster,
  reinforced tripod with a case at its foot.

---

### 4.5 `planDesign` — Good Plan Design · green `#56c271` / `#2c7a44`

*Benefits that make the high-value choice the cheap choice.* **Does not rotate.**

- **Base:** a green circular dais with a scalloped rim, engraved with a benefit-tier ring
  (three concentric bands, each a slightly different green).
- **Head (fixed, animated):** an **open binder on a lectern** — the summary plan
  description, pages fanned, with a soft green dome of light rising from it. Radially
  symmetric enough that its lack of rotation never reads as wrong.
- **Pulse loop (6f):** a translucent green ring expands outward from the dome and fades,
  looping continuously. Pages riffle by one frame. Loops on a ~1.4s cycle. The ring must
  stay inside the 256px frame — the actual aura radius is drawn separately by the engine.
- **t1 Deductible + Coinsurance:** a second binder, a small stack of forms, a coin column.
- **t2 Site-of-Care Steering:** two small signposts flanking the lectern pointing at
  different site icons; ring gains a dashed inner edge.
- **t3 Value-Based Benefit Design:** a raised marble-and-green plinth, gilded binder, and
  a double pulse ring — one bright inner, one wide outer.

---

### 4.6 `accumulator` — Accumulators · purple `#a06ee1` / `#5e3a91`

*Tracks deductible and out-of-pocket progress. Ramps up as the round goes on.*

- **Base:** a purple machine housing with a ventilated skirt, a paper-tape spool feeding
  out of a slot, and a small stack of printed tape curling on the ground.
- **Head:** an **odometer drum cannon** — a horizontal barrel made of four numbered
  counter wheels (blank digit shapes, not real numerals), pointing east, with a brass
  ratchet pawl on top and a short muzzle collar.
- **Fire cycle (4f):** f1 pawl lifts, first wheel rotates one click, purple charge in the
  muzzle; f2 discharge flash, wheel mid-rotation blur; f3 pawl drops back; f0.
- **t1 Real-Time Feed:** a data cable and a small blinking indicator light added.
- **t2 Family Deductible Tracking:** two barrels stacked vertically, six wheels each.
- **t3 Out-of-Pocket Max Enforcement:** four-barrel cluster with a heavy brass cap ring,
  a hard stop-block on the ratchet, and violet energy glowing between the wheels.

---

### 4.7 `cashPay` — Cash Pay Card · teal-green `#2fbfa4` / `#11786a`

*Settle at the cash price up front. Clears the claim and mints savings.*

- **Base:** a teal-green counter pedestal with a receipt printer slot down one side and a
  short curl of receipt paper on the ground.
- **Head:** a **card terminal on a swivel arm** — an angled keypad face with a bright
  screen and a card slot on the leading (east) edge; a virtual card sits half-inserted.
- **Fire cycle (5f):** f1 card slides fully in, screen flashes green; f2 approval burst —
  a ring of coin/banknote glints from the slot; f3 receipt tongue prints out of the base
  side; f4 card ejects; f0 rest.
- **t1 Higher Card Limit:** larger screen, embossed limit plate on the housing.
- **t2 Negotiated Cash Rates:** a small pre-shopped rate card rolodex clipped to the arm.
- **t3 Direct-to-Provider Settlement:** dual terminals on a fork mount, a same-day
  express chevron badge, and a strongbox integrated into the base.

---

### 4.8 `directContract` — Direct Contracts · orange `#ef8033` / `#a04f13`

*Contract straight with the provider. Weakens every claim in the radius.*

- **Base:** an orange signing desk — a low table plate with a leather blotter, an inkwell,
  and a small stack of contracts weighted by a paperweight.
- **Head:** a **giant fountain-pen nib on a press arm** — a polished nib in orange and
  brass angled east, mounted on a spring-loaded press yoke with a knurled adjustment
  wheel.
- **Fire cycle (4f):** f1 press compresses, nib dips and gathers a bead of ink; f2 the
  press fires, nib snaps forward, an ink-splash flash and a folded contract dart leaves;
  f3 spring rebound; f0.
- **t1 Bundled Case Rate:** the contract stack is now bound with a ribbon; wider nib.
- **t2 Centers of Excellence:** a small gold star medallion on the press yoke, twin nibs.
- **t3 Direct Primary + Specialty:** a full contract press — three nibs on a rotating
  head, a wax-seal stamper on a side arm, deep orange lacquer with brass banding.

---

### 4.9 `tracy` — Tracy · gold `#f5c518` / `#b08800`

*Makes every tower in her radius meaningfully better.* **Never rotates. Idle loop only.**

Tracy is the only human character in the game. She is the ops person who makes the whole
containment program actually work, and she should read as warm, competent, unhurried —
not a machine, not a mascot. Design her at top-down 80° like everything else, which means
mostly shoulders, headset and the desk surface, so her *silhouette* has to do the work:
give her a distinct hair shape and a clear desk footprint.

- **Base:** a warm gold-trimmed standing desk on a hex pad — laptop, three neat stacks of
  paperwork, a coffee mug, a small potted plant, cables tidied. The tidiness is the
  characterisation.
- **Head (fixed, animated):** Tracy herself behind the desk, wearing a headset, one hand
  on the laptop, a clipboard in the other.
- **Idle loop (6f):** typing — fingers move, shoulders rise and fall once, the clipboard
  tilts slightly, the mug steams. ~1.6s loop, seamless. No rotation, no aiming, no
  weapon, ever.
- **t1 Ops Playbooks:** a bound playbook binder open on the desk, sticky tabs.
- **t2 Cross-Team Escalation:** a second monitor showing a call grid, extra headset on a
  hook, a small whiteboard on the desk edge.
- **t3 Tracy, Everywhere:** the desk becomes a small command station — three screens in an
  arc, a soft gold halo, and two translucent gold "ghost Tracy" silhouettes at the flanks
  suggesting she is now everywhere at once.

Pair with the shared `fx/aura-buff-ring.png` pulse (§6) rather than baking her aura into
the sprite — the buff radius grows with tier.

---

### 4.10 `stopLoss` — Stop-Loss · steel `#8b95a6` / `#4a5361`

*A thorn barrier that only engages claims above the specific deductible. Tier 3 becomes a
continuous laser.* This tower **changes kind at t3** (`barrier` → `laser`), so t3 is a
genuinely different machine, not a bigger version of t2.

- **Base (t0–t2):** a steel-grey reinforced emplacement — sandbag ring or concrete
  revetment on a hex pad, ammunition crates, a threshold gauge dial mounted at the front
  with a red attachment-point needle.
- **Head (t0–t2):** a **short-barrelled mortar** angled east, loaded with a visible thorn
  canister, with a blast shield plate and a lanyard.
- **Fire cycle (4f):** f1 breech snaps shut, canister seats; f2 muzzle blast — grey smoke
  ring and a canister leaving; f3 barrel recoils into its cradle; f0.
- **t1 Lower Specific Deductible:** longer barrel, the gauge needle sits lower on the dial.
- **t2 Aggregate + Specific:** twin mortars on a shared cradle, second gauge added.
- **t3 Laser:** replace the mortar entirely with a **heavy laser emitter** — a thick
  cylindrical housing with cooling fins, a deep red focusing lens at the east end, coolant
  lines running back to the base, and warning chevrons. The base gains a generator block
  and a thick power conduit.
  - **Spin-up (4f):** f1 fins open and the lens dims; f2 lens charges dull red; f3 lens at
    full white-hot; f4 firing pose. **Hold on f4 for as long as the beam is up**, then
    play in reverse to f0. Pair with the `fx/laser-*` beam assets in §6.

---

## 5. Claim sprites

13 tokens — these are the balloons. They travel along the stone path and get repriced
into cheaper claims when hit, so **each tier must be distinguishable from its neighbours
at a glance and by colour alone at distance.**

Author every claim on a 256×256 canvas; the renderer scales to the on-screen diameter
listed below (from `claimRadius()` in `art.ts`).

Tiers 1–10 are round tokens — a coloured disc chassis with the subject embossed on top,
like a poker chip crossed with a medical object. Tiers 11–13 are **MOAB-class**: heavy,
plated, rounded-rectangle containers with visible armour panels, rivets and hazard
striping. Those three are what the player is really afraid of and they carry a health bar.

### Facing

- **Tiers 1–8, 10:** radially neutral. They are drawn top-down and are never rotated.
- **`airAmbulance`, `bundle`, `nicu`, `geneTherapy`:** draw these **facing EAST** so they
  can be rotated to follow the path like BTD6 blimps. Their long axis runs left-to-right.

| id | Name | Tier | On-screen ⌀ | Colour | Design |
| --- | --- | --- | --- | --- | --- |
| `lab` | Lab Panel | 1 | 30px | `#2fbfa4` | A capped blood-draw vial lying flat on a teal token, with a small barcode label band. Simplest sprite in the game — it is the atom everything decays into. |
| `officeVisit` | Office Visit | 2 | 30px | `#56c271` | A green clipboard token with a chart form and a pen clipped to the side. |
| `therapy` | PT / OT Session | 3 | 30px | `#8bc94a` | A lime token with a coiled resistance band and a small dumbbell. |
| `urgentCare` | Urgent Care | 4 | 30px | `#f0b429` | An amber token shaped like a clinic wayfinding sign — a rounded plaque with a bold chevron and a small cross. |
| `imaging` | Advanced Imaging | 5 | 36px | `#4b9fe1` | A blue MRI bore seen from above — a thick ring with a patient table sliding into it. Instantly reads as a donut, which distinguishes it from every other token. |
| `emergency` | ER Visit | 6 | 36px | `#d44d4a` | A red token with an ambulance seen from above, light bar lit. Fast-moving; give it faint speed chevrons on the trailing edge. |
| `specialtyDrug` | Specialty Infusion | 7 | 42px | `#a06ee1` | A purple token with a hanging IV bag and a drip line coiled beneath it. |
| `outpatientSurgery` | Outpatient Surgery | 8 | 42px | `#ef8033` | An orange token holding a surgical instrument tray — scalpel, clamp, folded drape. |
| `airAmbulance` | Air Ambulance | 9 | 48px | `#e8e3d3` | **Faces east.** A cream-white medevac helicopter from directly above: four-blade rotor (drawn as a soft motion arc, not four hard blades), tail boom to the west, red cross on the fuselage, skids visible. Pale and fast. |
| `inpatient` | Inpatient Admission | 10 | 48px | `#8b95a6` | A steel token with a hospital bed viewed from above — rails up, monitor at the head. **Author lighter than the listed hex** so trait tints read. |
| `bundle` | Institutional Bundle | 11 | 66px | `#5b6472` | **MOAB-class. Faces east.** A heavy slate shipping container, banded with steel straps, hazard-striped corners, four rivet plates, a manifest card slotted into the side. Bolted-shut and expensive-looking. **Author 20–25% lighter than the listed hex.** |
| `nicu` | NICU Stay | 12 | 78px | `#3d4550` | **MOAB-class. Faces east.** A sealed incubator pod — dark armoured shell with a rounded viewing window on top glowing warm, monitoring leads and a per-diem meter panel on the flank. Should feel like a life-support vault, sombre not scary. **Author 25–30% lighter than the listed hex.** |
| `geneTherapy` | Gene Therapy | 13 | 92px | `#f5c518` | **MOAB-class. Faces east. The boss.** A gold cryogenic transport capsule — armoured gold shell, frosted viewing port showing a glowing double-helix vial, cryo vapour venting from two ports, heavy gold-and-black hazard banding, reinforced end caps. Biggest and most ornate sprite in the game. |

---

## 6. Effects, projectiles and traps

All under `public/assets/fx/`. These currently exist only as procedural blobs and lines —
a white radial gradient for every projectile, an 8-pointed star for both trap types, and
`Graphics.strokePath()` lines for every beam.

### Projectiles — 32×32, pointing EAST

Each is rotated to its flight direction by the engine.

| File | Used by | Design |
| --- | --- | --- |
| `proj-network.png` | network | A small folded teal paper chit / discount slip, corner-first. Faint motion trail. |
| `proj-careNav.png` | careNav | A blue wayfinding chevron arrow with a soft light trail. |
| `proj-accumulator.png` | accumulator | A purple counter token stamped with a blank digit wheel, spinning. |
| `proj-directContract.png` | directContract | An orange folded contract dart with a wax-seal dot at the tip and an ink streak behind. |
| `proj-stopLoss.png` | stopLoss t0–t2 | A grey thorn canister with fins, tumbling. |

### Traps — 48×48, no rotation

| File | Used by | Design |
| --- | --- | --- |
| `thorn-edit.png` | ncci | A red rejection cluster — three crossed office staples with a small `×` denial mark at the crossing point, ink-stained. Sits flat on the stone path. Long-lived, so it must not visually shout. |
| `thorn-stopLoss.png` | stopLoss | A steel caltrop / road jack — four-pointed, chrome highlights, a red band around the hub. Heavier and more industrial than the edit staple. |

### Beams

| File | Size | Design |
| --- | --- | --- |
| `beam-rbp.png` | 256 × 32, tiles along X | Gold benchmark beam — a bright core with ruler-tick graduations along it, soft amber falloff at the edges. Reads as a measurement, not a laser. |
| `beam-laser-core.png` | 256 × 32, tiles along X | Deep red continuous laser — white-hot core, red bloom shoulders, faint heat shimmer. |
| `beam-laser-impact.png` | 96 × 96, 4-frame strip | Red impact splash where the laser meets a claim: scorch ring, sparks, a wisp of smoke. Loops while the beam holds. |
| `beam-muzzle-glow.png` | 64 × 64 | Soft additive glow blob placed at the emitter end of any beam. |

### Impact and destruction

| File | Size | Design |
| --- | --- | --- |
| `impact-tear.png` | 128 × 128, 5-frame strip | **Paper tear burst** — the claim being repriced. A ragged rip opens, torn paper shreds and confetti fly outward, then fade. This is the visual partner to the existing `pop.mp3` tear sound and is the single most-played effect in the game (round 20 fires it hundreds of times a second), so keep it light and let colour be applied by tint. Author in **neutral off-white/grey** so the engine can tint it to the claim's colour. |
| `impact-shred.png` | 192 × 192, 6-frame strip | The heavier MOAB-class version, for tiers 11–13 breaking: armour panels blowing off, a document blizzard, a dust ring. |
| `puff.png` | 48 × 48 | Soft neutral-white particle puff, radial falloff, no hard edge. Replaces the generated one. Tinted per claim. |
| `leak-burst.png` | 192 × 192, 5-frame strip | Plays at the exit when a claim reaches the plan: a red alarm flare, an invoice slamming down, a shockwave ring. Pairs with `leak.mp3` and the existing camera shake. |

### Auras and rings

| File | Size | Design |
| --- | --- | --- |
| `aura-buff-ring.png` | 512 × 512, 6-frame strip | Tracy's buff pulse — a warm gold ring expanding outward and fading, with faint sparkle motes. Scaled by the engine to her actual radius, so draw it as a thin ring near the frame edge, not a filled disc. |
| `aura-plan-ring.png` | 512 × 512, 6-frame strip | Good Plan Design's benefit pulse — a green ring with a dashed inner edge. Same construction. |
| `range-ring.png` | 512 × 512 | Static white range boundary ring, thin, ~10% inner fill fading to nothing. Replaces the procedural `strokeCircle`. |
| `select-ring.png` | 128 × 128 | Gold rotating selection ring for the currently-selected tower — dashed or ticked so its rotation is visible. |

### Map furniture

| File | Size | Design |
| --- | --- | --- |
| `gate-spawn.png` | 192 × 192 | The **CLAIMS IN** entrance at `PATH_POINTS[0]` — a green intake arch over the path: a submission chute with a queue of paperwork feeding in. Currently a plain green circle. |
| `gate-exit.png` | 256 × 256 | **THE PLAN PAYS** at the path's end — a red payout gate: an open ledger, a cash drawer, a warning-striped threshold across the path. Should look like the place you do not want claims to reach. Currently a plain red circle. |

---

## 7. Claim trait badges

Claims carry four Bloons-style modifiers that are currently signalled by tint alone,
which is ambiguous once several stack. Four small badge sprites, **64 × 64**, to be
composited at the claim's upper-right:

| File | Trait | Bloons analogue | Design |
| --- | --- | --- | --- |
| `trait-oon.png` | Out-of-network — invisible to towers without network sight | camo | A violet dashed-outline eye with a slash, on a semi-transparent chip. |
| `trait-clean.png` | Cleanly coded — blunt edit tooling slides off | lead | A brushed-silver shield chip with a checkmark; hard specular highlight so it reads as metal. |
| `trait-balanceBill.png` | Balance-billed — regrows a layer over time | regrow | An orange circular-arrow chip with a small `$` at its centre. |
| `trait-priorAuth.png` | Prior-authorised — doubled layer health | fortified | A gold rivet-studded plate chip with an approval stamp mark. |

---

## 8. Rubber stamps

The game already throws floating text for these events (`GameScene.float`). The React
chrome is built on a paperwork-and-rubber-stamp visual language, so replacing that text
with actual stamp sprites is the single highest-value cosmetic upgrade after the towers.

**192 × 96 each**, drawn as genuine rubber stamps: slightly rotated, uneven ink coverage,
a thin rectangular or oval border, letterpress texture, edges that break up. This is the
**one place baked text is required.**

| File | Text | Ink colour |
| --- | --- | --- |
| `stamp-denied.png` | `DENIED` | Green `#56c271` |
| `stamp-steered.png` | `STEERED` | Blue `#4b9fe1` |
| `stamp-cash-paid.png` | `CASH PAID` | Teal `#2fbfa4` |
| `stamp-paid.png` | `PLAN PAID` | Red `#d44d4a` — for leaks, the bad one |

---

## 9. Optional — UI portraits

The React chrome is deliberately image-free (kraft board, manila card stock and paper
texture, all CSS). If shop cards eventually want thumbnails, they should be **128 × 128
portraits on a transparent background**, framed as if photographed for a product
catalogue — the tower at a slight 3/4 angle rather than the top-down game view, so it
reads as a card illustration and not a scaled-down game sprite.

10 files: `ui/portrait-<towerId>.png`.

---

## 10. Delivery priority

| Phase | Contents | File count |
| --- | --- | --- |
| **P0 — playable replacement** | t0 base + head for all 10 towers; all 13 claims | 33 |
| **P1 — the ask** | t1–t3 base + head for all 10 towers (upgrade readability + tier-3 Stop-Loss laser) | 60 |
| **P2 — combat feel** | All of §6: projectiles, traps, beams, impacts, auras, gates | ~20 |
| **P3 — clarity** | §7 trait badges + §8 stamps | 8 |
| **P4 — optional** | §9 portraits | 10 |

---

## 11. Engine work this implies

Not sprites, but the art above cannot be dropped in without these — recording them so
nothing in the spec is a surprise later.

1. **`SimTower` has no facing angle.** `src/game/sim/Sim.ts` computes the shot angle
   locally inside `fireTower()` and discards it. It needs a persistent `facing` field,
   plus a `desiredFacing` updated every tick from the current target so the head can
   interpolate toward it at the turn rates in §3 rather than snapping.
2. **The `shot` event carries no target.** `{ kind: 'shot', x, y }` — it needs `ax`/`ay`
   (as `beam` already has) and the owning tower id, so the renderer knows which head to
   animate and which way it was pointing.
3. **Towers render as a single non-rotating `Image`.** `GameScene.renderTowers()` needs to
   become a base `Image` plus a head `Sprite` at `DEPTH.towers + 1`, with the head's
   `rotation` driven by `facing` and a one-shot fire animation on the `shot` event.
4. **The manifest format is flat.** `public/assets/manifest.json` is
   `{ towers: string[], claims: string[] }` and `PreloadScene` loads
   `assets/towers/<id>.png` as a plain image. It needs to describe per-tier base/head
   pairs and frame counts, and load heads via `this.load.spritesheet`.
5. **Claims use their texture's native size.** `renderClaims()` never calls
   `setDisplaySize`, so a 256px source PNG would render at 256px. Add
   `setDisplaySize(claimRadius(type) * 2, ...)`.
6. **Tier art needs a texture swap.** Upgrading currently only changes the tint; the
   renderer must re-point base and head at the new tier's textures when `t.tier` changes.
7. **Path-facing claims.** The four east-facing claims in §5 need their rotation set from
   the path tangent, which `Path.ts` can already derive from `arc`.
