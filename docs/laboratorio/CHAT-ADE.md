# Traer el chat del ADE a Qubbot (plan)

Objetivo: el chat de Qubbot igual de vivo que el del ADE, con sus mismos efectos y opciones:
- tarjetas de ejecución con orbes por actividad;
- borde de luz mientras trabaja;
- tarjetas, markdown y sugerencias al escribir;
- selector de modelo con esfuerzo;
- Qubi vivo en el banco con su menú de acciones.

Se usa la estructura de kubbot (MVVM con hooks, React) y los paquetes de Libraries.dev directo en React.

## Fuente (ADE, `/Users/jesus/orca/projects/team-12/renderer/`)

**Chat**
- `views/ui/chatView.js` (470 líneas): conversación, anclaje al final, «Ver el final ↓».
- `views/ui/runCardView.js` (397): la tarjeta de una ejecución del agente. Pasos con orbes según la actividad (`orbKeyOf`, `orbStateOf`), diff y estado.
- `views/ui/thinkingOrb.js` (97): orbes por actividad (`STEP_ORB`).
- `views/ui/chatCardsView.js` (302): tarjetas de resultado.
- `views/ui/markdown.js` (100): respuestas con formato.
- `views/ui/composerAssistView.js` (115), `viewmodels/composerViewModel.js`, `models/promptAssist.js`: ayuda al escribir.
- `views/ui/chatMenuView.js`, `viewmodels/chatMenu.js`: menú del chat.
- `models/runStory.js` y `models/answerFormat.js`.
- `viewmodels/chatViewModel.js` (695).
- `styles/chat.css` y `chat-glass.css`.

**Selector**
- `views/ui/agentPickerView.js` (305): píldora con el modelo y el esfuerzo, y un menú hacia arriba.
- `views/ui/effortSlider.js` (58).
- `models/agentConnectionModel.js` (`CATALOG`: modelos y esfuerzos).

**Robot con acciones**
- `viewmodels/robotViewModel.js` (164) y `robotDialogViewModel.js` (215): agarrar, arrastrar o lanzar el robot sobre algo; él pregunta qué hacer ahí.
- `views/scene/robotView.js`.

**Efectos**
- La skill `.claude/skills/libraries-dev/` (ya copiada aquí).
- Paquetes npm: `thinking-orbs`, `border-beam`, `metal-fx`, `voice-glow`, `bot-avatars`. Lee cada referencia antes de usar un componente y nunca inventes props.

## Destino en kubbot

1. **Chat (`src/views/components/chat/`, `src/viewmodels/useChatViewModel.ts`)**
   - Tarjeta de ejecución por mensaje de Qubi:
     - pasos con `ThinkingOrb` según la actividad (pensando, buscando o leyendo el banco, conectando, simulando, haciendo la caja, escribiendo código);
     - estado final y tiempo.
   - `BorderBeam` en el compositor mientras Qubi trabaja más de 3 s (regla de la skill).
   - Markdown seguro, sin HTML crudo.
   - Tarjetas de lo hecho, ya existen; ponerlas con el estilo del ADE.
   - Sugerencias al escribir (`promptAssist`) adaptadas al laboratorio.
   - «Ver el final ↓».
   - Menú del chat: nueva conversación y exportar.
2. **Selector de modelo (`src/views/components/chat/ModelPicker.tsx`, `src/models/agentModels.ts`)**
   - Modelos de Claude permitidos: Sonnet 5.5 (por defecto, rápido), Opus 5.5 (planes largos) y Haiku 5.5 (lo más rápido y barato).
   - Esfuerzo: low, medium, high.
   - La ruta `/api/agent` acepta `model` y `effort` solo de esa lista blanca; nada más llega a la API.
   - La elección se guarda en el navegador.
3. **Avatar y marca**
   - `BotAvatar` de Qubi en la cabecera del chat, con estado según la actividad real.
   - `MetalText` o `MetalBadge` solo en un título o badge clave («Laboratorio», «Beta»), sin abusar.
4. **Voz:** `VoiceBeam` (voice-glow) en la barra de llamada, reactivo al audio.
5. **Qubi con acciones en el banco**
   - Al tocarlo se abre un menú en su globo: Llamar, ¿Qué puedo construir?, Revisar conexiones, Conectar todo, Simular, Hacer la caja y Explicar la pieza seleccionada.
   - Si lo arrastras sobre una pieza, camina hasta ella y pregunta qué hacer: explicar, conectar, girar o quitar.
   - Todo pasa por las mismas herramientas del agente, de modo que lo que hace desde el robot queda en el chat.

## Reglas

Las de `CONTRATOS.md` y `QUBI.md`:
- texto visible en `src/views/copy/`;
- pruebas para la lógica pura;
- `npm test`, `typecheck`, `lint` y `build` en verde;
- claves solo en el servidor.
