# Platanus — conventions

Visual IDE for Platanus Hack 26 (AI Security track): the project is an isometric map, files get a security traffic light, and an AI agent creates and fixes code with user approval for risky actions.

## Rules

- **All code in English**: identifiers, comments, file and folder names, commit messages.
- **User-facing text in Spanish**, and only in the strings files:
  - renderer: `renderer/i18n/es.js` (static HTML uses `data-i18n`, `data-i18n-title`, `data-i18n-aria`, `data-i18n-placeholder`)
  - main process: `electron/strings.js`
- **MVVM** in the renderer (see below). Respect the direction of dependencies.
- **The renderer never touches the disk.** It calls `window.platanus.*` (preload), and `electron/main.js` validates, logs and asks for confirmation. All paths are relative to the workspace and cannot escape it.
- No bundler: native ES modules loaded by Electron from disk. three.js comes from `node_modules` via the import map.

## Renderer architecture (MVVM)

```
renderer/
  main.js         composition root: creates Models -> ViewModels -> Views, wires them, defines app `actions`
  core/           Observable (reactive state), event bus (EVENTS), formatting helpers
  i18n/es.js      every user-facing string (also tag labels, folder names, repair texts)
  services/       bridges to Electron (no logic): workspaceService (disk), agentService (agents + MCP),
                  mcpBridge (answers the MCP tools that need the window), serverService (listening servers)
  models/         data and rules; no DOM, no three.js, no UI state
    projectModel, fileTree, securityModel (traffic light), supabaseModel, demoProject
    agentModel (chat brain: scripted demo or the user's agent), agentConnectionModel (which agent,
    model, effort; one run at a time; 'chat' and 'repair' sessions)
    folderTags (tag and folder KEYS by name; labels live in es.js), modeModel (Vibe / Dev),
    repairHistoryModel (task list of repairs, per project, in localStorage),
    serversModel (servers listening on this computer: exposed = yellow), demoServers (web demo)
  viewmodels/     screen state + actions; no DOM, no three.js (layout.js = world geometry)
    camera, map (one folder level at a time), supabase, git (branches), app (which 3D view),
    shell (sidebar, stage tabs, explorer guide/tree, risks), graph (threat graph), chat,
    repair (Remi's job: walk, agent repair, outcome, queue), servers (polls every 3 s while its side view is open)
  views/scene/    three.js: sceneView, mapView, gitView, supabaseView, remiView, inputController,
                  builders/ (block, plaza, folder, git, schema, supabase, remi, remiModelLoader)
  views/ui/       HTML: shell, chat (+ runCard: live agent runs, markdown: safe Markdown), agentPicker
                  (+ effortSlider), chatMenu, agentConnect, graph, devTree, hoverCard, hud,
                  repairPanel, remiJump, panels (breadcrumb, schema, git), controls, labels
                  floating layout: iconBar (reorderable icons), draggable (side panel / chat by
                  header), floater (map cards: move, minimize, dock), chatDock (pinned chat column),
                  floatingMenu (⋯ menus: one layer above the app, anchored to its button, flips up, keyboard)
  views/icons.js  icon('name') / <i data-icon> from icons/hugeicons.js (generated, see Visual style)
  views/remiSprite.js  Remi's pixel art (card and jump)
  assets/remi/    optional 3D model for Remi (see its README for source and license)
  styles/         main.css (scene overlays, dark tokens), shell.css (glass IDE; floating layout at the end),
                  sidebar.css (motion), devtree.css, agents.css
electron/
  main.js         window, IPC, confirmations, recent projects, MCP handlers (read/write with approval + backup, undo)
  workspace.js    every disk operation, caged in the open folder
  git.js          read-only git history (execFile, no shell)
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
  strings.js      main-process texts
tests/renderer/   node:test unit tests for models and view models (renderer/package.json marks ESM for Node)
tests/secrets.test.mjs  fails if any tracked file contains a credential
docs/INTERFAZ.md  the interface: layout, chat and agents, repairs, where each piece lives, what is stored
spec/             feature specs (TEMPLATE.md, 001-running-servers.md)
docs/             one README per feature (docs/features/<name>/README.md, in Spanish) and an index (docs/README.md)
```

- **Models** expose an `Observable` `store` and methods. Example: `securityModel.scoreOf(path)` -> `{ level, reason | reasonKey, by: 'demo' | 'agent' | 'remi' }`.
- **ViewModels** subscribe to models, expose their own `store` and actions (`mapViewModel.enterFolder(path)`, `gitViewModel.focusLane(name)`, `repairViewModel.start(path)`). They talk to each other through the event bus (`core/eventBus.js`, names in `EVENTS`).
- **Views** subscribe to ViewModels and draw; user input only calls ViewModel actions. Clickable 3D objects carry `userData.pick = { type, ...ids }` and `MapViewModel.handlePick()` routes them.
- Change state only through `store.set(patch)`. Bump `version` when a view has to rebuild.
- **Tests first** for model/view-model behavior: add a case in `tests/renderer/` (fakes for services, `mock.timers` for delays), then change the code. `npm test` runs everything.

## Agents and repairs (security rules)

- The agent only acts through the local MCP tools. `platanus_write_file` always opens a confirmation dialog and backs up the previous version to `~/.platanus/backups/` (undo from the repair history). Secrets (`.env*`, keys, `.git/`, `.ssh/`, `.npmrc`…) are refused on the normalized and the real path.
- Grok runs with its terminal, edit and media tools removed (`--disallowed-tools`); Claude with `--tools ""`; Codex read-only, without the user's config and with its shell, browser, computer use, plugins and subagents disabled (`CODEX_DISABLED`). Do not loosen these flags.
- Remi never edits files himself; a repair ends as `planned` (plan only), `fixed` (agent changed files, yellow until the person verifies), `verified` or `failed`.

## Visual style ("digital twin", dark)

- Graphite background and ground, subtle grid. Silver, matte volumes; light roofs; dark slabs with a lighter rim.
- **One accent: the team purple `#8b83ff`** (selection, HEAD, data pulses, primary buttons), the same in the 3D scene and the shell. Amber `#ffc24a` and red `#ff5a6a` are reserved for security problems.
- **Only problems glow**: safe stays calm (silver, no glow). Glowing = emissive above the bloom threshold (`materials.*Lit`, `glowPad`); small pieces use the `*Solid` variants so they do not blob.
- Colors and materials live in `views/scene/materials.js` (`PALETTE`) and `views/theme.js` (`LEVEL_STYLE`); UI tokens in `styles/main.css` (`:root`). Do not hardcode new colors elsewhere.
- UI: dark glass panels (blur, 1px border), small purple dot in titles, mono font for paths and numbers.
- **Icons: Hugeicons only** (free, stroke rounded). Pick one at hugeicons.com, add it to `renderer/icons/iconNames.js`, run `npm run icons` (regenerates `renderer/icons/hugeicons.js` with just those icons; the package itself is a dev dependency), then use `<i data-icon="name"></i>` in `index.html` or `icon('name')` in views (`views/icons.js`). No hand-drawn SVG icons.

## Map navigation

The map shows one folder at a time: a plaza in the middle with the folder's own files (cubes with their traffic light, riskiest at the front) and its subfolders as blocks around it. Clicking a block enters that folder; the breadcrumb (in the status bar at the bottom) or Esc go back up; the folder's traffic-light counts stay at the top left of the map. `MapViewModel.path` is the folder on screen (`''` = root). The Supabase node only appears at the root. Folders are plain blocks for now (`BUILDING_STYLE` in `mapView.js`).

## Views

Two floating docks on the map: the top one switches between the map and git; the side dock (left edge, vertical) opens the side panels (explorer, risks, repairs, servers, agent), which appear right next to it, and below a divider the project and graph views. Both use `iconBarView.js` (drag to reorder within a group).

The stage tabs (`ShellViewModel.stage`: map, git, project, graph) drive `AppViewModel`, which picks the 3D view: `git` shows the branches as lanes, every other tab uses the map. Each 3D view draws on its own layer (`sceneView.layers.map | git`, labels with `layer: 'git'`) and keeps its own camera. Clicks, hover and Esc are routed to the active view in `main.js`; G toggles Map/Git.

Git is read only: `electron/git.js` runs fixed `git` commands with `execFile` (no shell) and returns commits, branches, tags and HEAD. `GitViewModel` assigns each commit to a lane (first-parent chains in git flow priority; deleted branches recovered from merge subjects) and flags commits that added red files (`.env`, keys) as risky.

## Hooks for the AI agent

- Replace the scripted brain in `models/agentModel.js`; keep the reply shape `{ text | html, tone, chips, then }`.
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
```

Opening `renderer/index.html` in a browser serves a demo project (no disk access).

## Deploy

- Web demo: `npm run build:web` -> `dist/` (static, three.js vendored). Vercel uses `vercel.json`; it must be connected to the personal mirror repo, not the org repo.
- Desktop: `npm run dist:mac` / `npm run dist:win` -> `dist-electron/` (electron-builder config in `package.json`, unsigned).
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds both installers and attaches them to the GitHub Release.
- `origin` has two push URLs (org repo + personal mirror); one `git push` updates both.
