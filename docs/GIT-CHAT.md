# Chat Git en lenguaje natural

Rama: `feature/chat-git-commands`

## Dónde está el código

| Dónde | Archivo | Git |
|---|---|---|
| **App Platanus** (chat "Agente Platanus") | [`renderer/models/gitIntent.js`](../renderer/models/gitIntent.js) + [`agentModel.js`](../renderer/models/agentModel.js), respuestas en `renderer/i18n/es.js`, tests en `tests/renderer/gitIntent.test.mjs` | **Real**, solo en la app de escritorio (`npm start`) vía `electron/git.js`. En el navegador responde que solo funciona en escritorio |
| Demo standalone | [`demo/index.html`](../demo/index.html) | Simulado en memoria |

`parseGitIntent(texto)` es una función pura: devuelve `{type:'commit'|'revert'|'reset'|'createBranch'|'checkout'|'explain'|'help', ...}` o `null`. `agentModel` solo ejecuta la intención. Diferencias de seguridad en la app real: `revert` sin SHA usa `HEAD` (último commit), `reset` **nunca** adivina el SHA (lo pide) y los nombres de rama nunca empiezan por `-`. Reset/revert/checkout siguen pidiendo confirmación en Electron.

Lo que sigue describe el intérprete con ejemplos de la demo; las frases funcionan igual en la app.


El chat de la guía ahora puede **ejecutar acciones de git** (commit, rollback, reset, ramas) y las refleja en el mapa 3D: cada commit construye un edificio y cada rollback/reset lo deshace. No hace falta memorizar una sintaxis: el intérprete entiende frases naturales, con o sin tildes, y está pensado para que luego funcione igual con **comandos de voz**.

> En la demo web (`demo/index.html`) el git es **simulado** (estado en memoria, no toca un repo real). No hace falta `npm start`.

## Cómo probarlo

1. Abre `demo/index.html` en el navegador (o `npm run build:web` y sirve la carpeta).
2. Abre el chat (abajo a la derecha) y escribe cualquiera de las frases de abajo, o pulsa los chips de sugerencia (ejecutan directo, sin Enter).
3. Tras cada commit aparecen chips `↩ Rollback · <sha>` y `⏮ Reset al <sha>` para deshacerlo con un clic.

## Qué entiende

| Intención | Ejemplos que funcionan |
|---|---|
| **Commit** | `commit arreglo login` · `guarda los cambios: fix pagos` · `haz un commit con el mensaje "listo"` · `confirma los cambios` |
| **Rollback** (revert, deshace con un commit nuevo) | `rollback` · `deshaz el último commit` · `vuelve atrás` · `quiero volver al commit anterior` · `revert abc1234` |
| **Reset** (destructivo, vuelve al inicio) | `reset` · `borra todo y empieza de cero` · `vuelve al inicio` · `resetear al commit abc1234` |
| **Crear rama** | `crea una rama para pagos` · `nueva rama login de usuario` · `branch dev` · `crea la rama feature/auth` |
| **Cambiar de rama** | `cámbiate a main` · `checkout feature/auth` · `ve a develop` · `cambia a la rama develop` |
| **Consultas** | `en qué rama estoy` · `muéstrame el historial` · `ayuda` |
| **Preguntas conceptuales** (solo explican, no ejecutan) | `qué es un rollback` · `diferencia entre reset y rollback` · `qué es un commit` |

Reglas útiles:
- Si dices `commit` sin mensaje, se usa `Actualización del proyecto`.
- Un `sha` es opcional; si no lo das, rollback apunta al último commit real.
- Los nombres de rama con espacios se convierten en guiones (`login de usuario` → `login-de-usuario`).
- Todo lo que no es git cae al FAQ del stack (`qué stack uso`, `hay algo caído`...). Si nada coincide, el chat muestra ejemplos.

## Cómo funciona por dentro

Todo vive en `demo/index.html`, sección `// ---- git command handler ----`:

```
ask(texto) ─► handleGitCommand(texto) ─► (si no es git) FAQ ─► fallback con ayuda
```

`handleGitCommand` evalúa **por intención y en orden** (el orden importa):

1. **Pregunta conceptual** (`qué es…`, `diferencia…`) → explica, no ejecuta.
2. **Consultas** (rama actual, historial, ayuda).
3. **Reset** (antes que rollback, porque "borra todo" no debe interpretarse como deshacer uno).
4. **Rollback/revert**.
5. **Crear rama** (requiere palabra *rama/branch* + verbo de creación).
6. **Cambiar rama**.
7. **Commit**.

Piezas de apoyo:
- `gitNorm(t)`: minúsculas, sin tildes ni signos, quita muletillas (`por favor`, `oye`, `quiero que`...).
- `stripLead(s, palabras)`: quita relleno al inicio para extraer el mensaje o nombre de rama.
- `slugBranch(s)`: convierte texto libre en nombre de rama válido.
- `SHA_RE`: detecta un sha (4–40 hex con al menos un dígito, para no confundir palabras como "deba").
- `applyRevert / applyReset / setBranch`: efectos sobre el mapa (`setStage`), el feed de eventos y la insignia de rama.
- `renderGitChips`: chips de rollback/reset tras un commit.
- Estado: `activeBranch`, `gitHistory`.

## Añadir una frase o un comando nuevo

- **Sinónimo nuevo**: añade la palabra al regex de la intención correspondiente en `handleGitCommand`.
- **Intención nueva**: agrega un bloque `if` antes del de commit y una fila en `GIT_HELP`.
- Prueba con una lista de frases en Node: extrae el bloque entre `const GIT_HELP` y `// ---- faq scripted` y llama a `handleGitCommand` con *stubs* de `say`, `setStage`, etc.

## Hacia voz

El texto transcrito suele traer mayúsculas, sin puntuación y muletillas: `gitNorm` ya lo tolera. Pendiente: nombres de rama dictados (`feature barra auth`), números de sha por voz y confirmación antes de acciones destructivas (reset).

## Limitaciones conocidas

- Git simulado: no hay `push`, `merge`, ni lectura de un repo real en la demo.
- El interprete es por reglas (regex), no un LLM; frases muy ambiguas caen al mensaje de ayuda.
