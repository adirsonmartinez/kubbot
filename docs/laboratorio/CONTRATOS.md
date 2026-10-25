# Qubbot Lab en kubbot: contratos entre módulos

Este repo es una app web: Next.js 16, React Three Fiber, TypeScript y MVVM (ver `AGENTS.md`). El laboratorio se construye aquí respetando sus capas:

```
app/ → views/ → viewmodels/ → services/ → models/
```

Contexto del producto, en el prototipo Electron: `/Users/jesus/orca/projects/qubbot-3d/docs/CONTEXTO-LABORATORIO.md`. El prototipo (JS vanilla) está en `/Users/jesus/orca/projects/qubbot-3d/renderer/`. Se **porta y mejora**; no se copia tal cual.

## Reglas

- **Nombre:** el producto es **Qubbot** y el bot **Qubi** (nunca «kubbot» en texto visible).
- **Pruebas:** `npm test` (`node --test "tests/**/*.test.ts"`, Node 24 quita los tipos solo); también `npm run typecheck` y `npm run lint`.
- **Imports:**
  - entre `models/` (y lo que importen las pruebas), imports relativos con la extensión `.ts`;
  - en `viewmodels/` y `views/`, el alias `@/…`, como el resto del repo.
- **Capas:** una View nunca importa `models/` ni `services/`, solo pasa por su ViewModel. Excepción aceptada: la escena 3D puede importar tipos y funciones de geometría pura de `@/models/lab/layout`. Si no quieres usar esa excepción, el VM las re-exporta.
- **Texto visible:** solo en `src/views/copy/lab.ts` (`labCopy`). Si falta un texto, añádelo en un sub-objeto con el nombre de tu módulo.
- **Estilo visual:** el vidrio oscuro de `src/views/styles/ui.css` (léelo); estilos nuevos en `src/views/styles/lab.css`. La paleta 3D está en `src/views/scene/palette.ts`. **Solo brillan los problemas** y lo que está vivo en la simulación.

## Ya hecho

- **`src/models/lab/catalog.ts`:** `COMPONENTS`, `CATEGORIES`, `componentOf`, `catalogSections` y los tipos `Component`, `Board`, `Part`, `BoardPin`, `PartPin`.
- **`src/models/lab/circuit.ts`:**
  - tipos `Design`, `PlacedPart`, `Wire`, `PinRef`, `Check`, `Issue`;
  - funciones `emptyDesign`, `parseDesign`, `serializeDesign`, `addPart`, `movePart`, `rotatePart`, `removePart`, `connect`, `disconnect`;
  - `checkDesign` (el verificador), `autoWire`, `netsOf`, `boardPinsOf`, `describeDesign`.
- **`src/models/lab/layout.ts`:** `MM`, `partBox`, `turn`, `pinSpots`, `pinSpot`, `freeSpot` (ring search around the first board, gap 0.6, snap 0.5), `wireKind`. `src/models/lab/framing.ts` (`frameBoxes`, `fitsView`) frames the bench in the area not covered by panels; the scene may import it like `layout`. En three.js un grupo de pieza usa `rotation.y = -rot * PI / 2`.
- **`src/views/copy/lab.ts`:** todos los textos.
- **Escena:** `src/views/scene/IsoScene.tsx` (cámara ortográfica, grid, bloom) acepta `children`. `MapInput.tsx` mueve el mapa con arrastre, rueda y teclado, y su `groundPointAt` está dentro del `useEffect`.

## Módulos nuevos (dueño entre paréntesis)

### Modelos (agente models)
- `src/models/lab/simulation.ts`: `simulate(design, tMs)` → `{ parts: Record<id, SimState>, wires: Record<wireId, number> }`. Se porta de `renderer/models/simModel.js`, que tiene 27 pruebas en verde.
- `src/models/lab/sketch.ts`: `sketchFor(design)` → `{ ok, reason?, code, board, libraries }`. Se porta de `renderer/models/sketchModel.js`. Pi lo está terminando; si sus pruebas aún fallan, corrígelo tú.
- `src/models/lab/enclosure.ts` + `enclosureFeatures.ts`: `enclosureFor(design)`, `toStl(enclosure, group?)` → `ArrayBuffer` y `toScad(enclosure)`. Se portan de `renderer/models/enclosureModel.js` y `enclosureFeatures.js`.
- `src/models/lab/bench.ts`: el **reductor puro** del banco. Lo usa el VM y se prueba solo.
  - `BenchState = { design, check, selected, wiring, hover, query, notice, sim: { running, t }, enclosure: { visible, exploded } }`.
  - Acciones: `add`, `move`, `moveEnd`, `rotate`, `remove`, `select`, `pickPin`, `hoverPin`, `cancelWire`, `autoWire`, `removeWire`, `setQuery`, `escape`, `toggleSim`, `tick`, `toggleEnclosure`, `toggleExplode`, `load`.
  - `notice` es un código (`{ kind, code, args }`); la vista lo traduce con `labCopy`.
  - Se porta la lógica de `renderer/viewmodels/labViewModel.js`.
- Pruebas para cada uno en `tests/*.test.ts`.

### Datos (agente viewmodel)
- `src/services/labStorage.ts`:
  - `loadDesign()` y `saveDesign(text)` en `localStorage`, con `try/catch` y sin romper si no hay;
  - `downloadFile(name, data, mime)` para STL, SCAD e INO;
  - `readDesignFile(file)` para importar un `circuito.json`.

### ViewModel (agente viewmodel)
`src/viewmodels/useLabViewModel.ts`. Usa `useReducer` con `bench.ts`, carga y guarda (con debounce) mediante `labStorage`, y avanza la simulación con `requestAnimationFrame` mientras corre. Expone:
- datos: `sections` (con nombres de `labCopy`), `design`, `check`, `simState`, `enclosure` (con `data = enclosureFor(design)` memoizado);
- comandos: `exportStl()`, `exportScad()`, `exportSketch()`, `applyAgentTool(name, input)` (para el chat), `issuesText` (avisos ya traducidos) y todos los comandos del reductor.

Exporta `type LabViewModel = ReturnType<typeof useLabViewModel>`.

### Modelos 3D (agente parts)
`src/views/scene/lab/parts/` porta `renderer/views/scene/lab/partMeshes.js` (y `parts/` si existe) a TS. Expone `buildPart(type)` → `PartHandle = { group, pins: Map<string, THREE.Object3D>, setLevel, setSelected, setHover, setSim, update(t, dt), dispose() }`. Es imperativo con three; React lo monta con `<primitive>`.

### Banco 3D (agente bench)
- `src/views/scene/lab/LabBench.tsx`: recibe `vm: LabViewModel` y `rig: CameraRig`, y va como hijo de `IsoScene`.
- `PartObject.tsx`: monta un `PartHandle`, sincroniza nivel, selección y simulación, y anima en `useFrame`.
- `Wires.tsx`: tubos curvos y partículas de corriente; `wireCurve.ts` se porta de `renderer/views/scene/lab/wireCurve.js`.
- `EnclosureObject.tsx`: porta `renderer/views/scene/lab/enclosureMesh.js`.
- `WiringLine.tsx`: la línea elástica.
- **Interacción** con eventos de R3F:
  - `onPointerDown` sobre una pieza la arrastra; hay que evitar que `MapInput` mueva el mapa, por ejemplo con `e.stopPropagation()` más una bandera compartida, o pasando por el rig una función `isGrabbing`;
  - sobre un pin, `pickPin`; `onPointerOver` sobre un pin, `hoverPin`, con una etiqueta HTML (`@react-three/drei` no está instalado: usa una etiqueta propia proyectada o instala drei y avisa).
- **Soltar desde el catálogo:** el canvas recibe `drop`; `LabBench` expone, mediante un `ref` o un callback del VM, una función `dropAt(clientX, clientY, type)` que convierte a punto del suelo.

### UI (agente ui)
`src/views/components/lab/`:
- `CatalogPanel.tsx`: buscador, secciones y tarjetas arrastrables (`dataTransfer` `application/x-qubbot-part`). Un clic pone la pieza en el centro.
- `CheckPanel.tsx`: «Revisión del circuito», con los avisos y el botón «Arreglar con Qubi», que llama a `onAsk(prompt)`.
- `LabToolbar.tsx`: barra flotante con Simular, Conectar solo, Caja (Ver, Ver por dentro, STL, OpenSCAD), Código, y Girar/Quitar si hay una pieza seleccionada; también el aviso (*toast*) y la pista mientras se cablea.

Estilos en `src/views/styles/lab.css`. Se porta y mejora de `renderer/views/ui/catalogView.js`, `labToolbarView.js` y `labDropView.js`.

### Agente del chat (agente chat)
- **`src/app/api/agent/route.ts`:** Route Handler que llama a Claude con el SDK oficial `@anthropic-ai/sdk` (instálalo). Lee `ANTHROPIC_API_KEY` y `QUBBOT_MODEL` del entorno; por defecto `claude-opus-5-5`. **Carga primero la skill `claude-api`.**
  - El *system prompt* hace al agente especialista en Arduino; usa `.claude/skills/kubbot-lab/references/arduino.md` como conocimiento si existe.
  - Las herramientas están en `src/models/lab/agentTools.ts`: esquemas de `lab_catalog`, `lab_view`, `lab_add_part`, `lab_connect`, `lab_auto_wire`, `lab_remove`, `lab_simulate`, `lab_make_enclosure`, `lab_make_sketch` y `applyAgentTool(design, name, input)` → `{ design, result }`, una función pura que corre en el cliente.
  - El navegador ejecuta las herramientas sobre su diseño y devuelve los resultados.
- **Ida y vuelta:** el cliente manda `{ messages, design }`; la ruta responde `{ content, toolCalls }`; el cliente aplica cada herramienta con el VM y vuelve a llamar con los resultados, hasta que el modelo termina.
- **Sin clave:** la ruta responde 503 y `src/services/agentService.ts` usa un asistente con reglas (sugerir ideas, conectar solo, revisar), marcado como «sin IA».
- **Integración:** `src/viewmodels/useChatViewModel.ts` recibe un `lab` opcional (`applyAgentTool`, `design`) para ejecutar las herramientas, y muestra en el chat tarjetas cortas de lo que hizo («Conecté 4 cables»).
- **Nunca** se pone la clave en el cliente ni en el código.

### Integración (orquestador)
`WorkspaceScreen.tsx`:
- los lados `catalog` (en lugar de Capas), `check` y `settings`;
- `LabBench` dentro de `IsoScene`, `LabToolbar` y el *drop* sobre el escenario;
- el chat conectado al laboratorio.
