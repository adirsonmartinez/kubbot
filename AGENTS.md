<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Architecture: MVVM

Code under `src/` is split into layers. Dependencies point one way only:

```
app/  →  views/  →  viewmodels/  →  services/  →  models/
```

| Folder | Layer | Rules |
|---|---|---|
| `src/models/` | Model | Domain types and pure functions. No React, no `fetch`, no browser APIs. Easy to unit test. |
| `src/services/` | Model (data) | Data access: APIs, storage, external datasets. Returns Model types. No React. |
| `src/viewmodels/` | ViewModel | `useXViewModel()` hooks. Own state, call models/services, expose display-ready values and commands (`increment()`, `start()`). No JSX. |
| `src/views/screens/` | View | One screen per ViewModel. Calls the hook and renders. No business logic. |
| `src/views/components/` | View | Reusable presentational components. Props in, markup out. No ViewModel calls. |
| `src/app/` | Routing | Next.js routes stay thin: they compose a screen. |
| `src/lib/` | Shared | Generic helpers with no domain knowledge. |

Conventions:
- Name files after the feature: `models/fire.ts`, `services/terrainService.ts`, `viewmodels/useFireViewModel.ts`, `views/screens/FireScreen.tsx`.
- A View never imports from `models/` or `services/` directly. Go through the ViewModel.
- Export `type XViewModel = ReturnType<typeof useXViewModel>` so subcomponents can take a VM slice as props.
- `src/models/counter.ts` and its chain are a reference example. Delete them once a real feature exists.
