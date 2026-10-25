# Chat agent: lab tools and behavior

The in-app agent (a model behind `POST /api/agent`, UI in the chat panel, ViewModel `useChatViewModel` + `useLabViewModel`) helps people design Arduino systems. It **proposes**; the deterministic checker **decides**. It acts only through the tools below; it cannot write files, run commands or call other services.

Status: the tools are the contract for `src/models/lab/tools.ts` (planned) and the route handler (`src/app/api/agent/route.ts`, planned); `services/agentService.ts` is a demo today. Names, schemas and replies here follow the Electron prototype (`platanus_lab_*`) adapted: drop the `platanus_` prefix and keep `lab_`. If you change one, change the schema, this file, the tests and the system prompt together (one vocabulary in three places).

## Architecture

- Stateless request: the browser sends `{ messages, design }` (current design, parsed with `parseDesign` on the server so a bad design is cleaned, never trusted). The route runs the model loop, applies tool calls with `applyLabTool(name, args, design)` on the server copy, and returns `{ reply, design, toolLog }`. The viewmodel then replaces its design, runs `checkDesign`, saves, and animates (parts appear, wires draw). The browser never needs the key.
- `applyLabTool(name, args, design)` is pure: `-> { design, result }`. It calls `addPart`, `connect`, `autoWire`, `removePart`, `disconnect`, `checkDesign`, `describeDesign`, `freeSpot`, `simulate`, `enclosureFor`, `sketchFor`. It never touches I/O.
- Bound the loop (for example at most 12 tool calls per message) and the design (`LIMITS`). Validate arguments (type, length, allowed characters) before using them; unknown input returns `ok: false` with a reason, never throws.
- No key set: the route answers in an explicit mock mode (and the UI says so). Mock mode may still run the tools on simple keywords, but never pretends to be a model.

## Result envelope (every tool)

```ts
type ToolResult = {
  ok: boolean;
  error?: "unknown" | "same" | "duplicate" | "full" | "noBoard" | "invalid";  // why not
  reply: string;       // plain text for the model: what happened, then describeDesign(design)
  check: { level: "green" | "yellow" | "red"; issues: Issue[]; budget: { board: string; usedMa: number; budgetMa: number }[] };
  // plus tool-specific fields below
};
```

`check` is always `checkDesign(design)` after the action. `Issue` is `{ level, key, part?, pin?, board?, boardPin?, usedMa?, budgetMa? }` with keys: red `short`, `mixedPower`, `overvoltage`; yellow `missing`, `wrongPin`, `undervoltage`, `pinShared`, `level`, `budget`, `noBoard`. The agent turns keys into plain Spanish (see the table in [arduino.md](arduino.md)). Pin references in tool input are `"<partId>.<pinId>"` (for example `"arduino-uno-1.D9"`, `"hc-sr04-1.ECHO"`); part ids are `<type>-<n>`.

## Read tools (do not change the design)

### `lab_catalog`
- Purpose: what parts exist, so the agent suggests only real ones.
- Input: `{ category?: "boards"|"sensors"|"actuators"|"displays"|"inputs"|"power", query?: string }`.
- Returns: `parts: [{ id, kind, category, name (Spanish), volts, mA, logic?, pins: [{ id, kinds | accepts }] }]` from `COMPONENTS` and the copy module.
- Rule: call it before proposing a project if unsure; never invent a part or a pin.

### `lab_view`
- Purpose: see the bench.
- Input: `{}`.
- Returns: `design` summary (`describeDesign(design)`: one line per part with its wires), `check`, and for each part its level (`check.parts`).
- Rule: call it first when the person asks about "my circuit", before changing anything.

### `lab_simulate`
- Purpose: show what the system would do (LED blinks, servo angle, sensor reading).
- Input: `{ t_ms?: number }` (0..60000, default 0). Deterministic: the same design and `t_ms` give the same output.
- Returns: `parts: { [id]: state }` per the `simulate` table (`led {on}`, `servo {angle}`, `distance {cm}`, `display {lines}`, ...), `wires: { [wireId]: 0..1 }`, and `dead: string[]` (parts that are miswired: `missing` or `wrongPin` in the checker).
- Rule: if `dead` is not empty or the check is red, say what is not working and why; never describe a dead part as working. The simulation is an illustration, not a measurement; say so if asked about exact values.

### `lab_make_sketch`
- Purpose: the Arduino code (`.ino`) for the current wiring.
- Input: `{}`.
- Returns: `{ ok, reason?, board, libraries: string[], code, check }`; `reason: "noBoard"` when there is no board.
- Rules: it uses the real wiring; with a red check it still returns code only if `sketchFor` can, but the agent must lead with the red issue. Do not paste the whole sketch in the chat unless asked: say it is ready to download/copy and list the libraries to install. Comments in the sketch are plain Spanish.

### `lab_make_enclosure`
- Purpose: a parametric printable box for the circuit.
- Input: `{ wall?: number (1.6..4, mm), clearance?: number (0.2..1.0, mm) }`; defaults 2.0 and 0.5.
- Returns: `{ ok, reason?, size: { w, d, h }, printMinutes, grams, notes: string[], check }` and makes the box visible in the 3D view (`enclosureFor`; STL/SCAD are downloaded by the person from the toolbar, never written by the agent). `reason: "noBoard"` when there is no board.
- Rules: say the weight and time are estimates ("aprox."), suggest PETG by default (ASA if an L298N or the outdoors is involved), and mention cutouts it made. Low voltage only.

## Write tools (change the design; same code as the UI)

### `lab_add_part`
- Purpose: put a catalog part on the bench.
- Input: `{ type: string, near?: string (part id), x?: number, z?: number, rot?: 0|1|2|3 }`. `type` must be a catalog id.
- Behavior: `freeSpot` next to `near` (or at x, z) so it does not overlap; id is assigned (`<type>-<n>`).
- Returns: `{ ok, id, ... }`; `ok: false, error: "unknown"` for a type not in the catalog (the reply lists close ids) and `"full"` at the limit.

### `lab_connect`
- Purpose: one wire between two pins.
- Input: `{ from: "part.pin", to: "part.pin" }`.
- Returns: `{ ok, wire?: id, error?, ... }`. Refusals: `unknown` (part or pin does not exist), `same`, `duplicate`, `full`. A connection that the checker dislikes **is still made** (the person may be learning), and the result carries the issue so the agent must report it; the agent should then offer to fix it.
- Rule: use real pin ids from `lab_view`/`lab_catalog`; prefer `lab_auto_wire` for standard hookups.

### `lab_auto_wire`
- Purpose: "Conectar solo": wires every unwired pin of a part (or all parts) to the board.
- Input: `{ part?: string, board?: string }`; without `part`, every part on the bench.
- Behavior: `autoWire`: power by voltage, ground and the I2C bus shared, signals on free pins keeping PWM and analog pins for those who need them.
- Returns: `{ ok, added: Wire[], missing: string[] }` where `missing` lists pins it could not wire (out of suitable pins). Then check and say what is left.

### `lab_remove`
- Purpose: remove a part (and its wires) or one wire.
- Input: `{ part?: string, wire?: string }`, exactly one.
- Returns: `{ ok, ... }`; `error: "unknown"` if it does not exist or both or neither given (`invalid`).

## Rules for the agent's behavior (put them in the system prompt; cover them in tests)

1. **The checker decides.** Never say a wiring is fine, safe or correct if the check is red. If yellow, say what is missing. Green means "no problem found by the revisión", not a guarantee; for anything the checker does not model (resistor for an LED, motor power, flyback diode, 5 V I2C on a 3.3 V board, I2C addresses) the agent adds the advice itself.
2. **Suggest with catalog parts only.** Call `lab_catalog` if unsure. If a good idea needs a part that is not there (for example IR sensors for a line follower, a second motor channel), say it clearly and offer the closest buildable version.
3. **Act directly when asked.** "Conéctalo", "agrega un sensor" means do it with the tools, then confirm in one line. Do not ask for confirmation for harmless bench changes; do ask before deleting a lot ("¿Quito todo el banco?") or when the request is ambiguous in a way that changes the result (which board).
4. **Explain in one or two plain sentences.** Spanish, no jargon, say what and why and the next step. Say "cable", "pieza", "placa", "corriente"; avoid "net", "ERC", "GPIO" unless the person used it (explain once: "un pin de la placa"). Do not dump pin tables or code unless asked.
5. **Safety.** Low voltage only. No mains. If asked for 110/220 V, a battery that powers a motor straight from a pin, or anything hot or dangerous, say it is outside the lab and why. Remind about common GND and separate supply for motors/servos when relevant.
6. **Tool hygiene.** Read first (`lab_view`), then change, then read the `check`. After an action, report what changed ("Agregué el sensor y lo conecté") and any issue. Never claim an action happened if the tool returned `ok: false`; say what failed and try the fix or ask.
7. **No secrets, no files.** Never ask for or echo keys; never output paths; tool arguments come only from the person's request and the catalog.
8. **Honesty about estimates and mock mode.** Weight, print time and simulation are approximate; mock mode is announced.
9. **Voice.** Friendly, encouraging, short. Offer one next step ("¿Quieres que le ponga una pantalla?"), not a menu.

Example exchanges (the agent's visible phrases are Spanish):
- Person: "Quiero un sensor de estacionamiento." Agent: calls `lab_catalog`, `lab_add_part` arduino-uno, hc-sr04, buzzer, led, `lab_auto_wire`, `lab_view`; replies: "Listo: puse una placa Uno, un sensor de distancia, un buzzer y un LED, y los conecté. La revisión está en verde. Ojo: en la vida real el LED lleva una resistencia de 220 ohmios. ¿Genero el código?"
- Person with an ESP32 and the sensor: result `yellow level` -> "Con el ESP32 el sensor devuelve 5 voltios y la placa solo aguanta 3,3. Hay que bajarlo con dos resistencias (1 k y 2 k) antes del pin. Mientras tanto la revisión lo marca en amarillo."
- Person: "Está bien así?" and the check is red `short` -> "No: ese cable une la corriente con la tierra y es un cortocircuito. Lo quito y lo conecto bien." (then `lab_remove` + `lab_connect`).

## Tests to write

- Each tool: valid input changes the design as the UI function would; invalid input returns `ok: false` with a reason and leaves the design untouched; `check` equals `checkDesign` of the returned design.
- A tool never accepts or returns paths, keys or HTML; names longer than the id limit are refused.
- Loop bound and `LIMITS` are enforced.
- Mock mode without a key runs and announces itself.
- The system prompt contains the rules above (a test can search for the key phrases) so they do not silently disappear.
