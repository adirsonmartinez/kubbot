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
                  mcpBridge (answers the MCP tools that need the window)
  models/         data and rules; no DOM, no three.js, no UI state
    projectModel, fileTree, securityModel (traffic light), supabaseModel, demoProject
    agentModel (chat brain: scripted demo or the user's agent), agentConnectionModel (which agent,
    model, effort; one run at a time; 'chat' and 'repair' sessions)
    folderTags (tag and folder KEYS by name; labels live in es.js), modeModel (Vibe / Dev),
    repairHistoryModel (task list of repairs, per project, in localStorage)
  viewmodels/     screen state + actions; no DOM, no three.js (layout.js = world geometry)
    camera, map, tower, supabase (the 3D map), shell (sidebar, stage, explorer guide/tree, risks),
    graph (threat graph), chat, repair (Remi's job: walk, agent repair, outcome, queue)
  views/scene/    three.js: sceneView, mapView, towerView, supabaseView, remiView, inputController,
                  builders/ (folder, headquarters, tower, schema, supabase, crack, remi, remiModelLoader)
  views/ui/       HTML: shell, chat, agentPicker, agentConnect, graph, devTree, hoverCard,
                  repairPanel, remiJump, panels, controls, labels
  views/remiSprite.js  Remi's pixel art (card and jump)
  assets/remi/    optional 3D model for Remi (see its README for source and license)
  styles/         main.css (map), shell.css (glass IDE), sidebar.css (motion), devtree.css
electron/
  main.js         window, IPC, confirmations, recent projects, MCP handlers (read/write with approval + backup, undo)
  workspace.js    every disk operation, caged in the open folder
  mcpServer.js    local MCP server (127.0.0.1, rejects browser Origin), tool list, secret blocklist
  agents.js       the user's CLIs (Claude Code, Grok, Codex) with minimal context and only Platanus' tools
  strings.js      main-process texts
tests/renderer/   node:test unit tests for models and view models (renderer/package.json marks ESM for Node)
```

- **Models** expose an `Observable` `store` and methods. Example: `securityModel.scoreOf(path)` -> `{ level, reason | reasonKey, by: 'demo' | 'agent' | 'remi' }`.
- **ViewModels** subscribe to models, expose their own `store` and actions (`mapViewModel.openFolder(path)`, `towerViewModel.focusFloor(i)`, `repairViewModel.start(path)`). They talk to each other through the event bus (`core/eventBus.js`, names in `EVENTS`).
- **Views** subscribe to ViewModels and draw; user input only calls ViewModel actions. Clickable 3D objects carry `userData.pick = { type, ...ids }` and `MapViewModel.handlePick()` routes them.
- Change state only through `store.set(patch)`. Bump `version` when a view has to rebuild.
- **Tests first** for model/view-model behavior: add a case in `tests/renderer/` (fakes for services, `mock.timers` for delays), then change the code. `npm test` runs everything.

## Agents and repairs (security rules)

- The agent only acts through the local MCP tools. `platanus_write_file` always opens a confirmation dialog and backs up the previous version to `~/.platanus/backups/` (undo from the repair history). Secrets (`.env*`, keys, `.git/`, `.ssh/`, `.npmrc`…) are refused on the normalized and the real path.
- Grok runs with its terminal, edit and media tools removed (`--disallowed-tools`); Claude with `--tools ""`. Do not loosen these flags.
- Remi never edits files himself; a repair ends as `planned` (plan only), `fixed` (agent changed files, yellow until the person verifies), `verified` or `failed`.

## Hooks for the AI agent

- Replace the scripted brain in `models/agentModel.js`; keep the reply shape `{ text | html, tone, chips, then }`.
- Set a file's traffic light: `securityModel.setScore(path, 'green' | 'yellow' | 'red', reason)`, or from anywhere:
  `window.dispatchEvent(new CustomEvent('file:score', { detail: { path, level, reason } }))`.

## Git flow

- `main`: production / demo-ready. Only receives merges from `release/*` and `hotfix/*`, tagged `vX.Y.Z`.
- `develop`: integration branch. Every feature starts here and comes back here.
- `feature/<short-name>` from `develop` (`git flow feature start chat-approvals`), merged back with `git flow feature finish`.
- `release/<version>` from `develop` to freeze and polish (the hour-26 feature freeze is a release branch).
- `hotfix/<version>` from `main` for urgent fixes during the demo; merged into `main` and `develop`.
- Never commit directly to `main`. Commit messages in English, imperative mood ("Add tower view").

## Run

```bash
npm install
npm start      # npm run dev opens DevTools
```

Opening `renderer/index.html` in a browser serves a demo project (no disk access).

## Deploy

- Web demo: `npm run build:web` -> `dist/` (static, three.js vendored). Vercel uses `vercel.json`; it must be connected to the personal mirror repo, not the org repo.
- Desktop: `npm run dist:mac` / `npm run dist:win` -> `dist-electron/` (electron-builder config in `package.json`, unsigned).
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds both installers and attaches them to the GitHub Release.
- `origin` has two push URLs (org repo + personal mirror); one `git push` updates both.
