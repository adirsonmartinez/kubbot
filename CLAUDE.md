# Platanus — conventions

Visual IDE for Platanus Hack 26 (AI Security track): the project is an isometric map, files get a security traffic light, and an AI agent creates and fixes code with user approval for risky actions.

## Rules

- **All code in English**: identifiers, comments, file and folder names, commit messages.
- **User-facing text in Spanish**, and only in the strings files:
  - renderer: `renderer/i18n/es.js` (static HTML uses `data-i18n`, `data-i18n-title`, `data-i18n-aria`, `data-i18n-placeholder`)
  - main process: `electron/strings.js`
- **MVVM** in the renderer (see below). Respect the direction of dependencies.
- **The renderer never touches the disk.** It calls `window.platanus.*` (preload), and `electron/main.js` validates, logs and asks for confirmation. All paths are relative to the workspace and cannot escape it.
- No bundler: native ES modules loaded by Electron from disk. three.js comes from `node_modules` via the import map;
  the libraries.dev effects (thinking orbs, border beam) come from `renderer/vendor/`, generated and committed
  by `npm run vendor` (`scripts/vendor-ui.js`). See AGENTS.md → "UI libraries".
- **The chat agent's voice lives in `agent/`** (voice.json + skills modo-vibe / modo-dev), built into its prompt by
  `electron/agentVoice.js`. Change how it talks there, not in code (see `agent/README.md`).

## Renderer architecture (MVVM)

```
renderer/
  main.js         composition root: creates Models -> ViewModels -> Views, wires them, defines app `actions`
  core/           Observable (reactive state), event bus (EVENTS), formatting helpers
  i18n/es.js      every user-facing string (also tag labels, folder names, repair texts)
  services/       bridges to Electron (no logic): workspaceService (disk), agentService (agents + MCP), labService
                  (the Arduino lab: main process + the emulator's Worker, avrWorker),
                  mcpBridge (answers the MCP tools that need the window), serverService (listening servers),
                  handTrackingService (camera -> up to two hands' landmarks with MediaPipe, local model in assets/hands/;
                  GPU or CPU, one hand when the CPU is too slow), faceTrackingService (camera at 1280×720 -> face
                  landmarks, 10 blendshapes (blinks, eyeLook*), the head's pose matrix and the mean light of a 32×24
                  thumbnail once a second; local model in assets/face/ from `npm run models`), cameraLoop (the
                  camera both share; video only, ideal size per use)
  models/         data and rules; no DOM, no three.js, no UI state
    projectModel (tree + detected integrations), fileTree, securityModel (traffic light), supabaseModel, demoProject,
    demoIntegrations (demo projects shown as connected to every integration)
    agentModel (chat brain: scripted demo or the user's agent), agentConnectionModel (which agent,
    model, effort; one run at a time; 'chat' and 'repair' sessions)
    folderTags (tag and folder KEYS by name; labels live in es.js), modeModel (Vibe / Dev),
    repairHistoryModel (task list of repairs, per project, in localStorage),
    answerFormat (the agent's ```sugerencias block -> next steps),
    serversModel (servers listening on this computer: exposed = yellow), demoServers (web demo),
    handGesture (pinch -> drag; two pinches, one holding and the other moving: up/down -> zoom, sideways -> turn;
    open hand -> cursor; holding still -> select;
    thresholds relative to the hand's size, with hysteresis),
    gazeModel (the gaze: a vector per frame (irises, lids, eyeLook*, head pose), guided calibration (9 points, a head
    step, 4 test points; all frames of each fixation, outliers dropped), ridge chosen leaving one point out, mirror
    check, One Euro + fixation hold, implicit affine correction, position check),
    gazeReport (the precision report, npm run dev + ⌘⇧D copies it: per point, per feature, leave-one-out per axis
    and per feature group, arrival in 150 ms steps, test error in px and degrees, filter; numbers only),
    faceGesture (head pointer, long blink, magnifier geometry, pull to the nearest target),
    handsFreeSettings (opt-in and adjustments: numbers only, validated)
    arduino/ (the Arduino lab, spec/005: parts (Wokwi types, pins, current), circuit (diagram.json + lab.json -> nets),
    validate (electrical rules, texts in es.js strings.lab.issues), peripherals (LED duty, buzzer Hz, HC-SR04 echo,
    servo, L298N), intelHex, emulator (ATmega328P over an injected avr8js), emulatorLoop (real time, ~33 ms slices))
  viewmodels/     screen state + actions; no DOM, no three.js (layout.js = world geometry)
    camera, map (the whole project; problems glow), supabase, git (branches), app (which 3D view),
    shell (sidebar, stage tabs, explorer guide/tree, risks), chat,
    repair (Remi's job: walk, agent repair, outcome, queue), servers (polls every 3 s while its side view is open),
    handControl (camera on/off, pinch and move pans the map; one hand holds and the other moves: up or down zooms
    around the holding hand, sideways turns; an open hand moves a cursor that selects by holding still ~800 ms; fps; spec/003),
    handsFree (eyes or head, spec/004: with the eyes, holding still opens a magnifier and inside it selects; with
    the head, holding still selects; position check -> calibration -> result to accept; each selection teaches a
    correction; pause, correct / recenter, long blink, "Ajustes"; one input at a time),
    editor (files clicked on the map as tabs: edit, save with the read mtime, disk changes reload or mark stale)
    lab (the Arduino lab: the project's lab folder or the example, the rules' issues, compile -> emulator, serial,
    the obstacle; spec/005)
  views/scene/    three.js: sceneView, mapView, gitView, supabaseView, remiView, robotView, labView (the Arduino bench), inputController,
                  builders/ (block, glassFolder, folderIcon, fileIcon, plaza, folder, git, schema, supabase, integration, remi, remiModelLoader, robot, arduino)
  views/ui/       HTML: shell, chat (+ runCard: live agent runs, markdown: safe Markdown with answer cards and
                  file links, chatCards: folder / file cards), icons (DOM helper over views/icons.js), thinkingOrb
                  (libraries.dev orbs over the package engine), agentPicker
                  (+ effortSlider), chatMenu, agentConnect, devTree, hoverCard, hud,
                  repairPanel, remiJump, editor (floating file editor with tabs, CodeMirror with syntax colors; secrets open flagged), panels (breadcrumb, schema, git), controls, handControl (hand button + camera preview + "?" with the gestures),
                  handCursor (purple cursor + hold-still ring; selects like a click; createHandTargets: what is under or
                  near a point), handTargets (what the cursor may select: 3D picks, and in panels anything clickable
                  except data-gesture="never"), handsFree (the eye button next to the hand's; its content in the hand's
                  camera card; a layer outside <body> with the cursor, the magnifier frame, the calibration veil
                  (a hole around the card) and its points), labels
                  floating layout: iconBar (reorderable icons), draggable (the chat by
                  header), floater (map cards: move, minimize, dock), chatDock (pinned chat column),
                  floatingMenu (⋯ menus: one layer above the app, anchored to its button, flips up, keyboard),
                  labCard (the Arduino lab's card: Probar / Detener, obstacle, issues, serial monitor, the part)
  views/icons.js  icon('name') / <i data-icon> from icons/hugeicons.js (generated, see Visual style)
  views/remiSprite.js  Remi's pixel art (card and jump)
  assets/remi/    optional 3D model for Remi (see its README for source and license)
  styles/         main.css (scene overlays, dark tokens), shell.css (glass IDE; floating layout at the end),
                  sidebar.css (motion), devtree.css, agents.css, chat.css (answer cards, chips, orbs, beam),
                  chat-glass.css (the chat's neutral liquid glass, `--lg-*` tokens), start.css (start screen in that glass),
                  controls.css (map controls, hand preview, gesture cursor and traffic-light counts in that glass),
                  handsfree.css (the hands-free card inside the hand's, and its layer: big buttons, at least the gaze's measured error), dock.css (side dock and view switcher in that glass), labels.css (folder, file and project labels), hud.css (security card and its floating bar), panel.css (side panel: redefines the shell tokens with the chat's), editor.css (floating editor, same idea), lab.css (the Arduino lab's card, same glass)
  vendor/         generated by scripts/vendor-ui.js (committed): border-beam (+React), thinking-orbs engine, avr8js (the lab's CPU),
                  codemirror.js (the editor; languages per models/fileLanguage.js, colors = `--syntax-*` tokens)
electron/
  main.js         window, IPC, confirmations, recent projects, MCP handlers (read/write with approval + backup, undo),
                  editor:open / editor:save (the person's own edits: secrets allowed, saving one asks; backup; mtime check)
  workspace.js    every disk operation, caged in the open folder
  git.js          read-only git history (execFile, no shell)
  arduino.js      arduino-cli compile (execFile, absolute path, fixed args, closed board list, temp folder) and the
                  agent's GitHub check (GET api.github.com/repos only, names validated, metadata only); tested
  servers.js      list of listening TCP servers (lsof on macOS, netstat + tasklist on Windows; execFile, absolute
                  paths, no shell); open http://localhost:<port> in the default, an installed (by id) or a picked
                  browser; stop a server (pid found from the port, native confirmation, re-checked, never Platanus
                  or system pids); pause / resume (SIGSTOP/SIGCONT, Windows NtSuspendProcess; all resumed on quit);
                  reactivate a server it stopped inside the app (asks first; login shell runs `exec "$@"` with the
                  words as arguments; no Terminal window; output kept in main; "starting" until the port listens;
                  a crash goes back to "Detenidos"; all stopped on quit; macOS only). The page never sends a pid,
                  a URL, a command or a program path.
  mcpServer.js    local MCP server (127.0.0.1, rejects browser Origin), tool list, secret blocklist
  agents.js       the user's CLIs (Claude Code, Grok, Codex) with minimal context and only Platanus' tools
  agentEvents.js  CLI output -> chat events (text, reasoning, tools, subagents, result); tested
  agentVoice.js   the chat agent's system prompt from agent/ (Vibe / Dev, adapts to how the person writes); tested
agent/            voice.json + skills/modo-vibe, skills/modo-dev, skills/modo-arduino (added when the talk is about Arduino)
examples/arduino/ the lab's examples (diagram.json, lab.json, sketch.ino and its compiled sketch.hex: npm run arduino:build)
.claude/skills/libraries-dev/  libraries.dev skill (effects: when and how to use them)
  strings.js      main-process texts
tests/renderer/   node:test unit tests for models and view models (renderer/package.json marks ESM for Node)
tests/secrets.test.mjs  fails if any tracked file contains a credential
docs/INTERFAZ.md  the interface: layout, chat and agents, repairs, where each piece lives, what is stored
spec/             feature specs (TEMPLATE.md, 001-running-servers.md, 003-hand-gestures.md, 004-hands-free-control.md, 005-arduino-lab.md)
docs/             one README per feature (docs/features/<name>/README.md, in Spanish) and an index (docs/README.md)
```

- **Models** expose an `Observable` `store` and methods. Example: `securityModel.scoreOf(path)` -> `{ level, reason | reasonKey, by: 'demo' | 'agent' | 'remi' }`.
- **ViewModels** subscribe to models, expose their own `store` and actions (`mapViewModel.enterFolder(path)`, `gitViewModel.focusLane(name)`, `repairViewModel.start(path)`). They talk to each other through the event bus (`core/eventBus.js`, names in `EVENTS`).
- **Views** subscribe to ViewModels and draw; user input only calls ViewModel actions. Clickable 3D objects carry `userData.pick = { type, ...ids }` and `MapViewModel.handlePick()` routes them.
- Change state only through `store.set(patch)`. Bump `version` when a view has to rebuild.
- **Tests first** for model/view-model behavior: add a case in `tests/renderer/` (fakes for services, `mock.timers` for delays), then change the code. `npm test` runs everything.

## Agents and repairs (security rules)

- Git from the chat (`models/gitIntent.js` parses what the person types; never the agent's output) only runs in the desktop app. `electron/git.js` validates every revision and branch name (a value starting with `-` would be a git option) and `main.js` asks before commit (shows the files; refuses if one is a secret per the MCP blocklist), revert, reset and switch. New branches are only logged. Tests: `electron/git.test.js`.
- The agent only acts through the local MCP tools. `platanus_write_file` always opens a confirmation dialog and backs up the previous version to `~/.platanus/backups/` (undo from the repair history). Secrets (`.env*`, keys, `.git/`, `.ssh/`, `.npmrc`…) are refused on the normalized and the real path.
- Grok runs with its terminal, edit and media tools removed (`--disallowed-tools`); Claude with `--tools ""`; Codex read-only, without the user's config and with its shell, browser, computer use, plugins and subagents disabled (`CODEX_DISABLED`). Do not loosen these flags.
- The window only gets the camera (video only, never the microphone) and clipboard writes, and only for the app's page (`allowPermission` in `electron/main.js`); every other permission is denied. Hand tracking runs locally (`docs/features/hand-gestures/`).
- Hand gestures and the hands-free control select anything clickable in panels (`handTargets.js`), except what carries `data-gesture="never"` and everything inside it (the hands-free pull never goes around a blocked target). Mark `never` on every action that runs without a confirmation dialog and changes code or security: repair, verify / mark fixed, undo an agent change, the approval mode, server actions (and `#server-menu`), the hand button and the eye button. Actions that open a native `confirm()` (commit, revert, reset, switch, agent writes) are safe because, while a dialog is open, `electron/main.js` sends `dialog:state` and nothing is selected.
- The hands-free control (spec/004) treats the face as biometric data: frames are analysed and dropped in the renderer; only the mesh points, 10 blendshapes (2 blinks, 8 eyeLook*) and the head's pose matrix reach the logic; calibration samples live in memory; nothing from the face is stored, logged, sent or given to the agent; `handsFreeSettings` keeps numbers only (validated on read). Nothing starts on its own: the camera only with the hand or eye button, the calibration only with "Empezar". The magnifier scales `<body>` with CSS, so a selection is always the real element.
- Remi never edits files himself; a repair ends as `planned` (plan only), `fixed` (agent changed files, yellow until the person verifies), `verified` or `failed`.

## Visual style ("digital twin", dark)

- Graphite background and ground, subtle grid. Silver, matte volumes; light roofs; dark slabs with a lighter rim.
- **One accent: the team purple `#8b83ff`** (the only other green is a connected integration's lit way, `glowLines.ok` = `--ok`) (selection, HEAD, data pulses, primary buttons), the same in the 3D scene and the shell. Amber `#ffc24a` and red `#ff5a6a` are reserved for security problems.
- **Only problems glow**: safe stays calm (silver, no glow). Glowing = emissive above the bloom threshold (`materials.*Lit`, `glowPad`); small pieces use the `*Solid` variants so they do not blob.
- Colors and materials live in `views/scene/materials.js` (`PALETTE`) and `views/theme.js` (`LEVEL_STYLE`); UI tokens in `styles/main.css` (`:root`). Do not hardcode new colors elsewhere.
- UI: dark glass panels (blur, 1px border), small purple dot in panel titles (not on map labels), mono font for paths and numbers.
- **Icons: Hugeicons only** (free, stroke rounded). Pick one at hugeicons.com, add it to `renderer/icons/iconNames.js`, run `npm run icons` (regenerates `renderer/icons/hugeicons.js` with just those icons; the package itself is a dev dependency), then use `<i data-icon="name"></i>` in `index.html` or `icon('name')` in views (`views/icons.js`). No hand-drawn SVG icons.

## Map navigation

The map shows the whole project as a tree that, from the default camera (`CAMERA.azimuth` 0, elevation 44°; the git view keeps its own diagonal angle), unfolds down and to the right (laid out in tree terms, `u` across and `v` down, with `toWorld` / `screenOf` and `treeBlock` in `layout.js`). At the top, a darker band holds the integrations: Supabase (its builders work along +x and are turned up the screen by `INTEGRATIONS.rotation`; its road drops straight onto the trunk) and, in a row to its right, Vercel, GitHub, Clerk and PostHog (`integrationBuilder.js`). `ProjectModel` detects them from the files (`vercel.json`, `.github/`, package.json dependencies); `models/demoIntegrations.js` gives a demo project ("Platanus") all five, as if it were connected. Each one has a state (`integrationStatus`): connected (green dot), with an incident (amber) or disconnected (red); detected ones are connected. Each live one, Supabase included, lights its way to the folders over the roads (`integrationLines`: down to the integrations' road, along it, down the trunk), green (`glowLines.ok` in materials.js: unlit, so it glows the same from every angle) when connected and amber with an incident; a shared stretch is green if any integration on it is connected. No packets or other motion on these ways. A disconnected one stays dark: no lit line, no spin, light off. Below it, the project's name (the root has no platform: one trunk runs from the integrations' road down to the first row of folders), then rows (8 per row, then wrapping) with every top-level folder (frosted glass folders, `glassFolderBuilder.js`: a dark back with its tab, white sheets peeking out, more sheets for more files, and a frosted front panel that shows them blurred), linked by comb-shaped roads, and, right after the last folder in the same rows, the root files as file icons as tall as the folders (`rootFiles`, up to 48, then "+N"). In an open branch, files likewise follow the subfolders. Safe things stay silver and calm; problems glow amber or red and come first (folders worst first, files riskiest first). Every file has a small label under its icon with its name and extension. Map labels carry no colored dot (the icon's color and the risk line say the level). Folder labels are always short: the folder's own name and its risk line. A project just created and still empty (`MapViewModel.welcome`) has a robot on its plaza asking what to build (`robotView.js`); it leaves with the first file. Clicking a folder unfolds its direct subfolders and files (the same size as the top-level row, at every depth) in a block right below it (up to 48, then "+N"); the rows of top-level folders under it move down to make room (they slide there) and the block stays right of the rows' spine; clicking one of those subfolders unfolds one more level further down. One path at a time: opening another folder folds the rest, and clicking an open folder again closes it (with everything open inside it). Esc goes up one level; the breadcrumb jumps to any level. "Centrar vista" (map controls) flies back to the initial view (`MapViewModel.home()`: default angle, integrations down to the top-level rows), leaving folders open. A fixed file turns silver and stays. `MapViewModel.path` is the open folder at any depth (`''` = none); `branches` holds one block per level of the open path (`opened` is the last one), `links` the roads and `band` the integrations band. `BUILDING_STYLE` in `mapView.js` switches the folders between frosted glass folders (`glass`, the default), cubes as tall as their file count (`blocks`), isometric folders and buildings.

## Views

Two floating docks on the map: the top one switches between the map and git; the side dock (left edge, vertical) opens the side panels (explorer, risks, repairs, servers, agent), which appear right next to it. Both use `iconBarView.js` (drag to reorder within a group).

The stage tabs (`ShellViewModel.stage`: map, git, lab) drive `AppViewModel`, which picks the 3D view: `git` shows the branches as lanes, `map` the security map, `lab` the Arduino lab's bench (its tab only shows while a lab is open: a project folder with a diagram.json, or the example; spec/005). Each 3D view draws on its own layer (`sceneView.layers.map | git`, labels with `layer: 'git'`) and keeps its own camera. Clicks, hover and Esc are routed to the active view in `main.js`; G toggles Map/Git.

The git view reads the history: `electron/git.js` runs fixed `git` commands with `execFile` (no shell) and returns commits, branches, tags and HEAD. `GitViewModel` assigns each commit to a lane (first-parent chains in git flow priority; deleted branches recovered from merge subjects) and flags commits that added red files (`.env`, keys) as risky.

## Hooks for the AI agent

- Replace the scripted brain in `models/agentModel.js`; keep the reply shape `{ text | html, tone, chips, after }` (`after`, never `then`: a reply is awaited, and a `then` method would make it a thenable that never resolves).
- Set a file's traffic light: `securityModel.setScore(path, 'green' | 'yellow' | 'red', reason)`, or from anywhere:
  `window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level, reason } }))`.

## Menus

The Project menu (new, open, recent, close) is built twice from the same actions: on macOS in the system menu bar (`nativeMenu()` in `electron/main.js`, rebuilt when a project opens or closes; items send `menu:action` to the window) and the in-app menu is hidden (`html.is-mac #menu`); on Windows/Linux and the web the in-app menu in the title bar is used and the native bar stays hidden. ⌘W closes the project, ⇧⌘W the window.

## Git flow

- `main`: production / demo-ready. Only receives merges from `release/*` and `hotfix/*`, tagged `vX.Y.Z`.
- `develop`: integration branch. Every feature starts here and comes back here.
- `feature/<short-name>` from `develop` (`git flow feature start chat-approvals`), merged back with `git flow feature finish`.
- `release/<version>` from `develop` to freeze and polish (the hour-26 feature freeze is a release branch).
- `hotfix/<version>` from `main` for urgent fixes during the demo; merged into `main` and `develop`.
- Never commit directly to `main`. Commit messages in English, imperative mood ("Add git view").

## Run

```bash
npm install
npm start      # npm run dev opens DevTools
npm run watch  # live reload: renderer/ changes reload the window, electron/ changes restart the app
npm run models # once: downloads the face model for the hands-free control into renderer/assets/face/ (commit it)
npm run arduino:build # compiles examples/arduino/*/sketch.ino to sketch.hex with arduino-cli (commit the .hex)
```

Opening `renderer/index.html` in a browser serves a demo project (no disk access).

## Deploy

- Web demo: `npm run build:web` -> `dist/` (static, three.js vendored). Vercel uses `vercel.json`; it must be connected to the personal mirror repo, not the org repo.
- Desktop: `npm run dist:mac` / `npm run dist:win` -> `dist-electron/` (electron-builder config in `package.json`, unsigned).
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds both installers and attaches them to the GitHub Release.
- `origin` has two push URLs (org repo + personal mirror); one `git push` updates both.
