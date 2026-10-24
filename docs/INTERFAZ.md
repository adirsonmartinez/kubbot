# Interfaz de Platanus

Guía de cómo está armada la interfaz y dónde vive cada cosa en el código. Para arrancar la app, ver el
[README](../README.md); para las reglas del código (MVVM, textos, git flow), ver [CLAUDE.md](../CLAUDE.md).

## La pantalla

El **mapa ocupa toda la ventana**. Todo lo demás flota encima y se puede plegar, mover o fijar.

| Pieza | Dónde está | Qué hace |
|---|---|---|
| Barra de íconos | Arriba, centrada en el mapa visible | Paneles (Explorador, Riesgos, Reparaciones, Conecta tu agente) y vistas (Mapa, Git, Proyecto, Grafo). Solo íconos: el nombre y la descripción salen al pasar el mouse. **Se ordena arrastrando** (o Alt+← / Alt+→) y el orden se recuerda. |
| Botón del panel | Arriba a la izquierda del mapa | Abre o cierra el panel lateral del ícono marcado. |
| Ruta | Al lado del botón del panel | Dónde estás (`team-12 / electron`, cada nivel se puede tocar para volver) y los archivos de ese nivel por semáforo: en riesgo, por revisar, seguros. |
| Panel lateral | Flota a la izquierda | Explorador (Vibe: guía con nombres sencillos; Dev: árbol completo con búsqueda), Riesgos (la única lista de riesgos), Reparaciones (historial de Remi y del agente), Conecta tu agente. **Se arrastra por su encabezado**; doble clic lo devuelve a su lugar. |
| Chat | Flota a la derecha | **Pin** 📌: lo fija como columna y el mapa le deja su espacio; arriba aparece la tarjeta de seguridad. **Borde izquierdo**: cambia el ancho (300–720 px, doble clic lo resetea). Se arrastra por su encabezado cuando no está fijado. Minimizado o cerrado, queda el botón flotante del agente (abajo a la derecha) con su menú. |
| Tarjeta de seguridad | Abajo a la derecha del mapa, o anclada sobre el chat fijado | Puntaje, archivos, en riesgo, por revisar, commits. Sus números de riesgo abren la lista de Riesgos. Se **arrastra** por su barrita (⠿), se **minimiza** con "–" y se **ancla** soltándola sobre la columna del chat (se ilumina al pasar). Doble clic en la barrita: vuelve a su lugar. |
| Menú de arriba (macOS) | Barra del sistema | Solo Platanus, Edición y Ventana: los menús de la app (Archivo, Ver, Agente…) están dentro de la ventana. |

Cada cosa aparece **una sola vez**: la lista de riesgos está en el panel, los totales en la tarjeta de
seguridad y la ruta solo cuenta la carpeta actual.

## El chat y los agentes

- **Quién responde:** el agente de demostración (sin IA) o tu suscripción de Claude Code, Grok o Codex.
  Se elige en el selector de abajo del chat ("● Opus 5.5 · Rápido ⌄") o en **Conecta tu agente**.
- **Modelos:** verificados contra cada CLI instalada (Claude: Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5;
  Grok 4.7 / 4.7 Fast / 4.6; Codex GPT-6.1 Sol / 6 Sol / 6 Luna). **Cuánto piensa** es una barra: de
  Rápido a Máximo (más esfuerzo, más tiempo y más gasto del plan).
- **Respuestas en vivo:** cada respuesta es una tarjeta con el agente, el modelo, un cronómetro, los
  pasos (herramientas de Platanus con el archivo que tocan; subagentes con sus pasos anidados), el
  razonamiento plegado, la respuesta en Markdown y al final tiempo, turnos y tokens.
- **Comparar respuestas:** la misma pregunta a dos agentes a la vez (selector del chat o el panel).
- **Botón "+":** nueva conversación, reparar lo más grave, historial, grafo, mapa del proyecto, conectar
  tu agente o tu editor (MCP), Vibe/Dev.
- **Conecta tu agente:** tarjetas por agente (sesión, versión, uso, último error, Usar / Entrar / Probar),
  el servidor MCP local con sus herramientas y su actividad en vivo, y los textos para Claude Code,
  Cursor, Codex y Gemini. La dirección del servidor lleva una llave privada: en pantalla sale tapada y
  "Copiar" la incluye.

## Reparaciones (Remi)

"Reparar" (en Riesgos, en el chat o "Reparar lo más grave") hace que Remi salte al mapa y camine a la
carpeta. Si hay un agente conectado, el agente lee el archivo y puede proponer un arreglo con
`platanus_write_file`: **cada cambio pide permiso en un cuadro de diálogo** y guarda una copia para
deshacerlo. El chat explica qué encontró, qué cambió y qué falta. Sin agente, Remi deja un plan.
Cada trabajo queda en **Reparaciones** con su estado: trabajando, plan listo, por verificar, verificado,
falló. Desde ahí se marca como verificado, se deshace un cambio o se reintenta.

## Dónde vive cada cosa (renderer)

| Archivo | Para qué |
|---|---|
| `views/ui/shellView.js` | Menús, barra de íconos (contenido y descripciones), panel lateral (explorador, riesgos, reparaciones), mapa del proyecto, barra de estado. |
| `views/ui/iconBarView.js` | Ordenar los íconos arrastrando o con Alt+flechas; recuerda el orden. |
| `views/ui/draggable.js` | Arrastrar el panel lateral y el chat por su encabezado. |
| `views/ui/floater.js` | Tarjetas flotantes del mapa: barrita para mover, minimizar y anclar (la tarjeta de seguridad). |
| `views/ui/chatDockView.js` | Pin del chat (columna a la derecha + zona de información arriba) y su ancho. |
| `views/ui/chatView.js`, `runCardView.js`, `markdown.js` | Mensajes, tarjetas de respuesta en vivo, Markdown seguro (escapa todo antes). |
| `views/ui/agentPickerView.js`, `effortSlider.js`, `chatMenuView.js` | Selector de agente/modelo/esfuerzo/comparar, barra de esfuerzo, menú "+" y del botón flotante. |
| `views/ui/agentConnectView.js` | Panel "Conecta tu agente". |
| `views/ui/devTreeView.js` | Explorador en modo Dev (búsqueda, filtros, teclado). |
| `views/ui/repairPanelView.js`, `remiJump.js`, `views/scene/remiView.js` | Remi: tarjeta, salto por la interfaz y personaje 3D en el mapa. |
| `views/ui/hudView.js`, `panelsView.js` | Tarjeta de seguridad, ruta, esquema de Supabase y resumen de Git. |
| `models/agentConnectionModel.js` | Qué agente, modelo y esfuerzo; una pregunta a la vez por agente; estadísticas; actividad MCP. |
| `viewmodels/chatViewModel.js` | Conversación, tarjetas de respuesta (pasos, subagentes, resultado), sugerencias. |
| `viewmodels/repairViewModel.js`, `models/repairHistoryModel.js` | Trabajo de Remi y su historial. |
| `electron/agentEvents.js` | Traduce la salida de cada CLI (Claude/Grok/Codex) a eventos del chat. Probado aparte. |

Estilos: `styles/main.css` (mapa y escena), `shell.css` (la interfaz de vidrio, al final están las
capas flotantes, pin y barra de íconos), `sidebar.css` (animaciones del panel), `devtree.css`, `agents.css`.

## Lo que se recuerda (en esta computadora)

Se guarda en `localStorage` de la ventana; Electron guarda la carpeta de datos en
`~/Library/Application Support/platanus-ide` (macOS). Cerrar la app normalmente (o con una señal del
sistema) asegura que se escriba.

| Clave | Qué guarda |
|---|---|
| `platanus.agent.choice.v1` / `platanus.agent.stats.v1` | Agente, modelo y esfuerzo elegidos / uso por agente. |
| `platanus.mode.v1` | Vibe o Dev. |
| `platanus.repairs.v1:<proyecto>` | Historial de reparaciones de cada proyecto. |
| `platanus.iconbar.order.v1` | Orden de la barra de íconos. |
| `platanus.drag.v1:sidebar` / `:chat` | Posición del panel y del chat movidos a mano. |
| `platanus.chat.dock.v1` | Chat fijado y su ancho. |
| `platanus.float.v1:hud` | Posición, minimizado y anclaje de la tarjeta de seguridad. |

En la carpeta de datos de Electron: `recent.json` (proyectos recientes) y `mcp-token` (llave del servidor
MCP, solo legible por tu usuario). Las copias de los cambios del agente van a `~/.platanus/backups/`.

## Seguridad (resumen)

- El agente solo actúa con las herramientas de Platanus (MCP local); Claude con `--tools ""`, Grok y Codex
  sin terminal ni edición propia. No aflojar esas opciones.
- Secretos (`.env*`, llaves, `.git/`, `.ssh/`, `.npmrc`, `credentials.json`…) nunca se leen ni se
  escriben, tampoco a través de enlaces simbólicos.
- El servidor MCP escucha solo en 127.0.0.1, rechaza navegadores y exige su llave privada.
- `npm test` revisa cada archivo del repo y falla si alguien intenta subir una credencial.
