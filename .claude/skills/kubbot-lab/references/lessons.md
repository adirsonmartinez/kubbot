# Lessons

Carried over from the Electron prototype (Qubbot, `team-12` / `qubbot-3d`) where they still apply here, plus a section for new ones. Electron-only lessons (CDP, MCP bridge, ElevenLabs, Remotion video, IPC) were dropped on purpose. Keep this file true: delete what stops being true.

## The person and how they work
- They write informal Spanish and read only Spanish, in plain words. Answers are short and direct. They review by looking at the real running app (screenshots), so check visually; a green typecheck does not prove a 3D scene renders.
- The audience of the product is not technical (students, makers). Every visible string is plain Spanish: no jargon, no English leftovers, no spelling mistakes (the demo is judged on screen). Visible strings live only in the copy module (`src/views/copy/lab.ts`) so they are easy to review.
- Naming: the product is Kubbot Lab (the Electron prototype called it Qubbot with a robot "Qubi"; check the repo's copy before reusing those names). Do not use "Platanus" in visible text; `package.json` still says `platanus`, which is legacy.
- Demo context: Platanus Hack 26 judges weigh Originality 15, Ambition 20, Execution 20, **Technical 25**, Impact 20 %; 3-minute live demo, hard cut at 3:01. So the deterministic checker, parametric STL generation and validated agent tools are the technical showpieces; the live demo must work end to end without tricks; dark mode, large text.

## Security and secrets
- Never open or print `.env` / `.env.local`. Never ask for or accept keys in the chat, never put keys in code. Test fixtures that need a fake key build it at run time (a tracked-file scan test may exist; fake keys written literally trip it).
- `ANTHROPIC_API_KEY` (or any model key) exists only on the server, in `src/app/api/agent/route.ts`. Never send it to the browser, never log it, never echo it in tool results.
- The app must run with `npm i && npm run dev` and **no keys**. Without a key the chat uses an explicit mock mode, and says so in the UI.
- The agent acts only through the validated lab tools ([agent-tools.md](agent-tools.md)). No shell, no file paths from the model, no arbitrary URLs. Treat every tool argument as untrusted input: validate type, length and value (unknown part types, pin names, limits) with the same functions the UI uses.
- An agent allowlist must be tested adversarially: try to make a tool write outside the design, accept a path, or loop forever (bound the tool-call loop and the design size: `LIMITS`).
- A deterministic check must never read a value the agent can set. The checker reads the design only; the agent never passes a "level" or "ok" into it.
- Only audit or design for things the person can show are theirs; do not publish ready-to-use attack scripts against third parties. For hardware: no mains-voltage designs, no instructions to defeat safety parts, no printed enclosures for mains.
- Marketplace submissions (later) are untrusted: validate every field (sizes, pins, volts, mA, license) before they enter the catalog. A license field must be real; no copying geometry from sources with unclear or non-commercial licenses.

## Honesty
- **No fake data presented as real.** Mock chat replies, demo designs, estimated times and prices must say what they are ("estimado", "ejemplo", "modo de prueba"). Never silently swap a real feature for a fake one when a key or a dependency is missing: show what is missing instead (the prototype's call fell back to a simulated one and the person saw "Llamada simulada" when they wanted the real one).
- A demo path that keys off something incidental (a folder name, a timer, "no agent connected") leaks fake data into real use. Gate demos on an explicit flag.
- The agent never says a wiring is fine when `checkDesign` says red, and never claims a part exists when it is not in the catalog. A tool description that promises a visible effect must have it (a tool that says it "moves the camera" must).
- Estimates (grams, minutes, prices) come from formulas in the models, are labelled approximate, and are tested against a known case.
- Verify numbers against an independent computation, not only unit tests (a hand-computed box volume vs `toStl` volume; a datasheet value vs the catalog row). A capped scan silently covered half a project once.

## Engineering practice
- **Tests first.** Pure logic in `src/models/lab/*` with `node --test` tests in `tests/`. Node runs the `.ts` files directly (type stripping): inside models and tests import with the explicit `.ts` extension (`./catalog.ts`), avoid enums, namespaces, parameter properties and path aliases there. Views and viewmodels may use `@/` aliases.
- Keep MVVM: `app -> views -> viewmodels -> services -> models`; views never import models or services; models are pure and deterministic (no `Date.now()`, `Math.random()` or I/O inside a function the tests call; pass time and seeds in).
- This Next.js (16) has breaking changes: read `node_modules/next/dist/docs/` before writing routes or config; heed deprecation notices.
- Put in the contract every store field one module reads from another; tests with fakes pass if each fake has the field the real module dropped. Keep one vocabulary for a tool's answers in three places: the tool's result, its description to the model, and the system prompt (the prototype answered `sin-servidor` while the description said `no-existe`).
- Anything that waits in a line (approvals, requests) must check again when its turn comes: the person may have changed the design.
- After each change run the app (`npm run dev`) and read the console and the terminal: an empty-list case crashed the screen while hundreds of tests passed.
- Reviews of new stateful view models find real races (state re-keyed when a late reply arrives, cards vanishing on a new chat, rejected writes shown as saved). Ask for one before a big merge.
- A 3D object that should face the camera reads the camera angle every frame (`useFrame`), not once at creation. A part dragged on the bench is drawn under the cursor: keep the grip offset from where it was grabbed and decide the drop target from the visual spot; show a ring or footprint shadow while dragging.
- CSS traps worth remembering: a `display:flex` rule beats the browser's `[hidden]`; class names are global, grep before inventing a short generic one; `:last-of-type` matches the element type, not the class.

## Git and process
- Git flow: work on `feature/*`, PR to `develop`. **Commit or push only when the user asks.** End commits and PR bodies with the attribution lines the session gives.
- Update the docs and the module header comments when a module changes; keep `MEMORY.md` (if present) short and current, and move stable lessons here.
- Cheap models (Pi, Mimo, Qwen) may do bounded, parallel tasks, each on its own files, never two agents on the same file. Review everything delegated: `npm test`, `npm run typecheck`, `npm run lint`, and read the diff. Deterministic checkers decide safety; no model does.
- Parallel work needs a written contract of the shapes the modules exchange (see the planned file table in SKILL.md and the prototype's `CONTRATOS.md`).

## Known gaps in the lab (found while writing the references; fix or keep honest in agent replies)
- The checker has no series resistor model: a catalog LED wired straight to a pin is "green". Agent and copy must still recommend 220-330 ohm. A resistor row could be added.
- The 5 V I2C pull-ups of the LCD 1602 backpack are not flagged on 3.3 V boards (ESP32, Pico); only HC-SR04 raises `level`.
- Per-pin current is not checked (catalog buzzer `mA: 30` exceeds the Uno's 20 mA recommended per pin).
- ESP32 strapping pins (GPIO2, 5, 12, 15) and ADC2 pins with WiFi are offered by the catalog without a warning.
- The L298N exposes only one channel and no motor supply or outputs; the battery pack only joins `vin` pins (Uno, Nano). Line follower and similar projects need new parts.
- Relay contacts (COM/NO/NC) are not modeled.
- I2C address clashes are not checked.
- Connector positions (USB, jack) are not in the catalog; the enclosure needs them in `enclosureFeatures.ts`.

## Add new lessons below
Format: one or two lines, the rule first, then why or where it was learned. Date them if they may expire.
