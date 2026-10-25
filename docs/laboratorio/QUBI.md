# Qubi: el agente del laboratorio (contrato)

Qubi es el agente de Qubbot. Con él se puede:
- hablar por chat o por llamada de voz;
- verlo en el banco 3D, donde camina hasta la pieza en la que trabaja, hace gestos y muestra lo que dice en un globo;
- pedirle que haga cualquier cosa del laboratorio;
- **asignarle tareas**: un objetivo («arma una estación del clima») que él convierte en un plan con pasos visibles y ejecuta.

Lee primero `docs/laboratorio/CONTRATOS.md` (reglas del repo y módulos del laboratorio) y `AGENTS.md` (MVVM). Tipos compartidos: `src/models/qubi/types.ts`. No los cambies sin avisar.

## Fuente para portar

El ADE Electron está en `/Users/jesus/orca/projects/team-12/renderer/` (JS vanilla):
- **Robot:**
  - `views/scene/builders/qubiBuilder.js`, `robotBuilder.js` y `qubiModelLoader.js`;
  - el modelo en `assets/qubi/`;
  - `views/scene/guideRobot.js` (`moveTo`, `face`, `pose`, `gesture`, `expression`, `gazeAt`);
  - `views/scene/robotGestures.js` y `models/gestures.js`.
- **Llamada:**
  - `viewmodels/callViewModel.js` y `models/callSession.js`;
  - `electron/voiceCall.js` (ElevenLabs: crear o actualizar el agente, URL firmada, saludos venezolanos);
  - `electron/strings.js` (`voice.greetings`, prompt de voz).

Se porta la idea y el aspecto; no se copian las dependencias de Electron.

## Módulos y dueños

### 1. Robot 3D (agente robot)
- `src/views/scene/lab/qubi/` (TS), con `QubiRobot.tsx`: `<QubiRobot state={QubiState} />`, hijo de `IsoScene`, en la capa del banco.
- **Caminar:** camina con easing hacia `state.target`. Se detiene a un lado de la pieza, no encima, y se gira hacia ella.
- **Gestos y caras:** reproduce `state.gesture` cuando cambia `gesture.at`, y pone la cara de `state.expression`.
- **Actividad:** se refleja en la pose:
  - `listening`: anillo o antena que pulsa;
  - `thinking`: mira arriba;
  - `talking`: la boca o la luz se mueve;
  - `working`: brazos.
- **Globo:** `bubble` como etiqueta HTML o sprite sobre su cabeza, legible y corta.
- **Al hacer clic** sobre él: `onClick` (abre la llamada o el chat).
- **Acciones en el banco** (`QubiRobot` con `onAction`, `parts`, `selectedPart`, `partName`):
  - al tocarlo se abre su menú (`QubiMenu.tsx`, teclado: flechas, Enter, Esc): Llamar, ¿Qué puedo construir?, Revisar conexiones, Conectar todo, Simular, Hacer la caja y «Explicar <pieza>» si hay una seleccionada;
  - si lo agarras y lo sueltas (o lo lanzas) sobre una pieza, camina hasta ella y pregunta «¿Qué hago con <pieza>?»: Explicar, Conectar, Girar, Quitar. Sobre el banco vacío se queda donde cae;
  - todo llama a `onAction(clave, idPieza?)` (`QubiActionKey` en `src/models/qubi/actions.ts`, que también tiene qué pieza hay bajo un punto y el lanzamiento); `qubiCopy.actions.prompts` trae los mensajes de chat listos;
  - arrastrarlo no mueve el mapa: se registra con `benchInput.claim(fn)` (varios reclamantes, sin tocar el de LabBench).
- **Pruebas:** la lógica pura de caminar y de los gestos (`walk.ts`, `gestures.ts` dentro de esa carpeta) con `node --test` en `tests/qubiRobot.test.ts`.

### 2. Director y view model (agente director)
- **`src/models/qubi/director.ts`** (puro): `directorReducer(state: QubiState, event: AgentEvent | {type:"call", ...} | {type:"tick", now}, ctx: { design })` → `QubiState`.
  - Herramienta que toca una pieza (`lab_add_part`, `lab_connect`, `lab_auto_wire`, `lab_move`…): `target` = posición de esa pieza (con `pinSpot` o `partBox` de `@/models/lab/layout`), `activity` = `working`, gesto `work`.
  - Al terminar todo, gesto `celebrate` si salió bien o `shrug` si algo falló.
  - `reply`: `bubble` = la primera frase, acortada.
  - Los textos fijos del globo vienen de `src/views/copy/qubi.ts`, que se le pasan al reductor, porque los modelos no importan vistas.
- **`src/models/qubi/tasks.ts`** (puro): reductor de tareas para `plan` y `step`, y el resumen.
- **Pruebas:** `tests/qubiDirector.test.ts` y `tests/qubiTasks.test.ts`.
- **`src/viewmodels/useQubiViewModel.ts`:** junta el director, las tareas y la llamada. Expone:
  - `state` (`QubiState`) y `tasks`;
  - `onAgentEvent(e)`: lo llama el chat;
  - `greet()`: saludo al empezar, aleatorio, con un toque venezolano (frases de `voice.greetings` del ADE, en `src/views/copy/qubi.ts`).

### 3. Herramientas y tareas del agente (agente herramientas)
- **`src/models/lab/agentTools.ts`:** añadir herramientas, con pruebas en `tests/agentTools.test.ts`:
  - `lab_move {part, x, z}`, `lab_rotate {part}`, `lab_focus {part}` (Qubi va y la señala);
  - `lab_load_example {name}`: por ahora `parkingSensor` de `src/models/lab/examples.ts`; añade 2 ejemplos más, estación del clima con DHT22 + OLED y riego con suelo + relé, también verdes;
  - `lab_clear`;
  - `lab_plan {goal, steps[]}`: publica el plan de una tarea;
  - `lab_step {index, state}`: marca el avance.
- **`src/app/api/agent/route.ts`:** *system prompt* de Qubi:
  - pana venezolano, breve y cálido;
  - para un objetivo de varios pasos, primero `lab_plan` y luego cada paso con `lab_step`;
  - nunca da por buena una conexión en rojo.
  - Acepta `mode: "voice"` en el cuerpo: respuestas de 1 o 2 frases, sin markdown, sin listas, sin leer ids.
- **`src/viewmodels/useChatViewModel.ts`:**
  - opción `onEvent?: (e: AgentEvent) => void`, que emite eventos en cada paso del ciclo;
  - `ask(text, { mode })` devuelve una promesa con el texto final, para la llamada;
  - una tarjeta de **tarea** en el chat con la lista de pasos y su estado: componente `src/views/components/qubi/TaskCard.tsx`, renderizado desde `ChatPanel`.

### 4. Llamada de voz (agente voz)
- **`src/services/voice/browserVoice.ts`** (gratis, sin claves):
  - reconocimiento: `webkitSpeechRecognition` o `SpeechRecognition`, `es-VE` con respaldo `es-ES`, continuo y con resultados parciales;
  - voz: `speechSynthesis` con la mejor voz en español disponible;
  - mientras habla deja de escuchar, para no oírse a sí mismo;
  - si el navegador no tiene reconocimiento de voz, avisa con el código `noSpeech`.
- **`src/services/voice/elevenlabsVoice.ts`** + **`src/app/api/voice/route.ts`:**
  - si existe `ELEVENLABS_API_KEY` en el servidor, la ruta crea o reutiliza un agente de ElevenLabs Conversational AI (voz en español venezolano, primer mensaje = saludo) y devuelve una URL firmada; sin clave, 503;
  - el cliente usa el SDK oficial (`@elevenlabs/client`; instálalo y revisa su documentación en `node_modules`) con *client tools* que llaman a `lab.applyAgentTool` y emiten los mismos `AgentEvent`;
  - la clave nunca llega al navegador.
- **`src/viewmodels/useCallViewModel.ts`:** `CallState`; `start()` usa ElevenLabs si la ruta responde, si no el navegador; `stop()` y `toggleMute()`.
  - En el modo navegador, cada frase final de la persona va a `chat.ask(text, { mode: "voice" })`, y la respuesta se dice en voz alta.
  - La transcripción de ambos aparece en el chat.
- **`src/views/components/qubi/CallBar.tsx`:**
  - el botón de llamar en la cabecera del chat (un componente que el orquestador coloca) y una barra flotante durante la llamada;
  - en la barra: estado, ondas cuando habla o escucha, silenciar y colgar;
  - mensajes de error traducidos.
- **Estilos:** `src/views/styles/qubi.css`.
- **Pruebas:** la lógica pura (elegir la voz, cortar frases, el estado de la llamada) en `tests/call.test.ts`.

### Integración (orquestador)
- En `WorkspaceScreen.tsx`:
  - `<QubiRobot>` dentro del banco;
  - `useQubiViewModel`, `useCallViewModel` y el chat conectados entre sí;
  - el botón de llamada y la tarjeta de tareas.

## Reglas
- Nunca leer ni imprimir `.env*`. Las claves (`ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`) solo se leen en el servidor.
- Texto visible: Qubi en `src/views/copy/qubi.ts` (nuevo; cada agente añade su sub-objeto) y el laboratorio en `src/views/copy/lab.ts`.
- Al terminar deben pasar `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.
