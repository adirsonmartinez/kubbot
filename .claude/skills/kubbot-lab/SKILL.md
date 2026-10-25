---
name: kubbot-lab
description: How to work on Kubbot Lab (this repo), the Arduino systems lab with a 3D isometric bench, a component catalog, wires between pins, a deterministic electrical checker, a chat agent that wires parts through validated tools, simulation, generated Arduino sketches (.ino) and parametric 3D-printable enclosures (STL). Use at the start of ANY task in this repo, and especially when touching the component catalog, the bench or 3D parts, wiring, the circuit checker (checkDesign/autoWire), simulation, sketch generation, enclosure or STL generation, the chat agent and its lab tools (src/app/api/agent), adding a new component, or when you need Arduino electronics or FDM printing facts (voltages, pins, resistors, level shifting, wall thickness, standoffs, cutouts).
---

# Kubbot Lab

Kubbot Lab turns a visual IDE into an **Arduino systems lab**: people drag parts from a catalog onto a 3D isometric bench, draw wires between pins, get an instant electrical check, ask a chat agent to suggest and wire projects, simulate them, export the Arduino code (`.ino`) and a parametric printable enclosure (STL). Later: a marketplace where makers and brands submit components (a validated "component sheet" = a catalog row).

The audience is non-developers and non-electronics people (STEM students, makers in Latin America). Everything they read is **plain Spanish**. Everything you write in code, comments and docs here is English (the repo's convention), except user-facing copy.

`AGENTS.md` / `CLAUDE.md` at the repo root hold the stable architecture rules (MVVM, layer direction, and a warning that this Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before writing Next code). This skill covers how to work on the lab and keeps the electronics and printing knowledge.

## Core principle: the LLM proposes, the checker decides

- `checkDesign` (`src/models/lab/circuit.ts`) is deterministic and is the only authority on whether a wiring is safe. No model (Claude, Codex, Pi, the in-app agent) decides that, and nobody overrides it from the chat.
- The in-app agent acts **only** through validated lab tools (see [references/agent-tools.md](references/agent-tools.md)). Every write goes through the same pure functions as the UI (`addPart`, `connect`, `autoWire`, `removePart`) so it cannot produce an invalid design; the tool then returns the checker result and the agent must report it honestly.
- Simulation, sketch and enclosure are pure functions of the design too: same design in, same output out. No randomness, no clock reads inside models (pass `tMs` in).
- If you teach the checker a new rule, add a test that fails first. If a model says "it's fine" and the checker says red, the checker wins.

## Every task

1. **Read `MEMORY.md`** at the repo root if it exists, then only the docs it points to. Do not reread the whole repo. Read the Next.js docs in `node_modules/next/dist/docs/` before touching routes, route handlers or config.
2. **Tests first.** Logic lives in `src/models/lab/*` as pure TypeScript with tests in `tests/*.test.ts`. Run:
   - `npm test` (= `node --test "tests/**/*.test.ts"`, Node runs the `.ts` files directly, so use relative imports with the `.ts` extension inside `src/models` and tests, and no path aliases or enums in models);
   - `npm run typecheck` (`tsc --noEmit`);
   - `npm run lint` (`eslint`).
   Add a failing test, then the code. All three must be green before you say done. For anything visible also run `npm run dev` and look at it (the bench is 3D: a green typecheck does not prove it renders).
3. **Keep the MVVM layers** (`app → views → viewmodels → services → models`, one direction only):
   - models: pure, no React, no `fetch`, no browser APIs;
   - services: data access and the agent call, return model types;
   - viewmodels: `useXViewModel()` hooks, no JSX, export `type XViewModel = ReturnType<typeof useXViewModel>`;
   - views: render only. **A view never imports from `models/` or `services/`; it goes through the ViewModel.** If a view needs a model type, re-export it from the ViewModel.
4. **Copy in Spanish, plain, in the copy module** (`src/views/copy/lab.ts`; the catalog says names and descriptions live there). No jargon: say "conectar" not "enrutar", "pieza" not "componente" when talking to the person, "cable" not "net", "revisión del circuito" not "ERC". Spell out electrical issues in one sentence a 14-year-old understands (see the plain-Spanish table in [references/arduino.md](references/arduino.md)).
5. **Update docs** when you change a module: the module comment at the top of the file, the relevant reference here, and any `docs/` page the repo has for the lab. Remove what is no longer true.
6. **Update `MEMORY.md`** (if present) before finishing: what changed and where, pending work, one line per lesson. Move stable lessons to [references/lessons.md](references/lessons.md).
7. **Commit or push only when the user asks.** Git flow: `feature/*` branches, PR to `develop`. End commits with the attribution lines the session gives.
8. Never open or print `.env*` files; never put keys in code or tests (build fake keys at runtime). See [references/lessons.md](references/lessons.md).

## Where things are

Current files exist today; planned ones follow the contracts of the Electron prototype (`qubbot-3d/docs/features/laboratorio/CONTRATOS.md`) adapted to this repo. Create planned files in the folder shown; do not invent other places.

| Need | File | State |
|---|---|---|
| Component catalog (boards, parts, pins, volts, mA, sizes, mounting holes, license source) | `src/models/lab/catalog.ts` (`COMPONENTS`, `componentOf`, `catalogSections`, `PIN_KINDS`) | exists |
| Design (parts + wires), checker, auto-wiring, text description for the agent | `src/models/lab/circuit.ts` (`parseDesign`, `addPart`, `connect`, `checkDesign`, `autoWire`, `boardPinsOf`, `describeDesign`, `netsOf`) | exists |
| Bench geometry: footprints, pin world positions, free spot, wire kind | `src/models/lab/layout.ts` (`MM = 0.1`, `partBox`, `pinSpots`, `freeSpot`, `wireKind`) | exists |
| Simulation: state of each part and flow per wire at time `t` | `src/models/lab/sim.ts` (`simulate(design, tMs)`) | planned |
| Arduino sketch from the wiring | `src/models/lab/sketch.ts` (`sketchFor(design)` -> `{ ok, reason?, code, board, libraries }`) | planned |
| Enclosure: solids, cutouts, STL/SCAD, grams and minutes | `src/models/lab/enclosure.ts` (`enclosureFor`, `toStl`, `toScad`) and `src/models/lab/enclosureFeatures.ts` (per-part cutout data) | planned |
| Agent tool handlers (pure: design in, design + reply out) | `src/models/lab/tools.ts` (`applyLabTool(name, args, design)`) | planned |
| Design persistence and exports (save design, download `.stl` / `.scad` / `.ino`) | `src/services/labService.ts` | planned |
| Agent call from the browser | `src/services/agentService.ts` (demo today) -> `POST /api/agent` | demo |
| Lab state and commands (add, move, rotate, remove, pickPin, autoWire, sim, enclosure, export) | `src/viewmodels/useLabViewModel.ts` (`LabViewModel`) | planned |
| Chat state | `src/viewmodels/useChatViewModel.ts`, `src/models/chat.ts` | exists |
| Agent route handler (model call + lab tools, keys server-side only) | `src/app/api/agent/route.ts` | planned |
| 3D bench scene (parts, wires, enclosure, drop target) | `src/views/scene/lab/*`: `LabBench.tsx`, `PartMesh.tsx` (procedural model per catalog id), `WireMesh.tsx`, `EnclosureMesh.tsx` | planned |
| Isometric scene, camera, ground, palette | `src/views/scene/IsoScene.tsx`, `CameraController.tsx`, `Ground.tsx`, `palette.ts`, `src/models/camera.ts` | exists |
| Lab UI: catalog panel (search, cards, drag), circuit review, toolbar (Simular, Conectar solo, Caja, Codigo) | `src/views/components/lab/*` | planned |
| Screen that composes it | `src/views/screens/WorkspaceScreen.tsx` | exists |
| Spanish copy for parts, issues, toolbar, agent chips | `src/views/copy/lab.ts` | planned |
| Tests | `tests/circuit.test.ts`, `tests/layout.test.ts`, then `tests/sim.test.ts`, `sketch.test.ts`, `enclosure.test.ts`, `tools.test.ts` | partly |

Design file shape: `{ version: 1, parts: [{ id, type, x, z, rot }], wires: [{ id, from: { part, pin }, to: { part, pin } }] }`. Units: bench 1 unit = 10 mm, `rot` = quarter turns, enclosure in mm. Part ids are `<type>-<n>` (`arduino-uno-1`, `led-1`). Limits live in `LIMITS` (60 parts, 240 wires).

Checker vocabulary (`IssueKey`): red = `short`, `mixedPower`, `overvoltage`; yellow = `missing`, `wrongPin`, `undervoltage`, `pinShared` (I2C bus may be shared), `level` (5 V signal into a 3.3 V board), `budget` (5 V draw above the board's `budgetMa`), `noBoard`. Levels per part in `check.parts`. Known gaps (the checker does **not** model: series resistors, per-pin current, flyback diodes, motor supply, common ground between separate supplies, I2C address clashes). Document such advice in the agent's reply and in [references/arduino.md](references/arduino.md); do not pretend green means "perfect".

## How to add a component

1. **Catalog row** in `src/models/lab/catalog.ts` (`COMPONENTS`): `id` (kebab-case, unique), `kind`, `category`, `size` `[w, d, h]` in mm from the datasheet, `color`, `pins` (part pins use `accepts`; board pins use `kinds`), `volts`, `mA` (worst case), `out5v` if it sends 5 V back on a signal pin (HC-SR04 echo), `bus: "i2c"` for I2C parts, `holes` for boards, and a `source` with an **open license** (Adafruit CAD Parts MIT, kicad-lib-arduino CC0, Arduino docs CC BY-SA 4.0, or "Hoja de datos del fabricante" for public measurements). Do not copy geometry from sources with unclear licenses (see [references/printing.md](references/printing.md)).
2. **Copy** in `src/views/copy/lab.ts`: visible name, one-sentence description, and a "what it is for" line in plain Spanish, plus a hint for any pin that is not obvious.
3. **Tests** in `tests/circuit.test.ts`: the catalog test already checks unique id, known category, size, pins and a source license; add a wiring case (right pins green, wrong supply red or yellow as expected). `autoWire` should wire it with no manual help.
4. **3D model** in `src/views/scene/lab/PartMesh.tsx`: procedural, recognizable, to scale with `MM`, origin at footprint center with y = 0 on the floor, pins at the positions `pinSpots` gives, `userData.pick` on pins and body. Only problems and "alive" things glow (red/amber, lit LED, current).
5. **Enclosure features** in `enclosureFeatures.ts`: where it needs a wall cutout (USB, sensor "eyes"), a lid window (display), a dome (PIR), mounting holes and the height it needs. Use the rules in [references/printing.md](references/printing.md).
6. **Simulation** in `sim.ts`: its state shape (`{ kind, ... }`), plus what a dead (miswired) part looks like.
7. **Sketch** in `sketch.ts`: library, `#include`, pin definitions from the real wiring (`boardPinsOf`), `setup()` and `loop()`, comments in plain Spanish. Never emit a pin the checker flagged.
8. **Agent**: it reads the catalog through `lab_catalog`, so nothing to change unless the part needs a special rule; add the part's recipe to [references/arduino.md](references/arduino.md) (pins, voltage, library, minimal code, gotchas).
9. Run `npm test && npm run typecheck && npm run lint`, then look at the part on the bench.

Marketplace note: a submitted component is the same row plus copy, validated before it enters (sizes, pins, license, volts/mA sanity). Keep `catalog.ts` data-only so a JSON sheet can map to it.

## References

- [references/arduino.md](references/arduino.md): boards, pin limits, level shifting, pull-ups, resistors, relays/motors/servos, a recipe per catalog part, common mistakes in plain Spanish, project ideas.
- [references/printing.md](references/printing.md): FDM rules for enclosures and mounts, fits, standoffs, cutouts, materials, STL and OpenSCAD, open sources and licenses, print estimate.
- [references/agent-tools.md](references/agent-tools.md): the in-app agent's lab tools and behavior rules.
- [references/lessons.md](references/lessons.md): lessons carried over and a place to add new ones.

## Keep this skill alive

When a task teaches something non-obvious (a checker quirk, a library limit, a part measurement you verified with calipers, a user preference), add it to [references/lessons.md](references/lessons.md) right away. When a module is created, move it from "planned" to "exists" in the table above. Mark unverified electrical or mechanical numbers as such and verify them against the datasheet before relying on them. Remove what stops being true: stale advice is worse than none.
