# Platanus

IDE visual para Platanus Hack 26, track AI Security. Tu proyecto se ve como un mapa isométrico: la carpeta raíz es el edificio principal, cada carpeta un edificio, y al abrir uno ves sus archivos por piso como cubitos con un semáforo de seguridad. Un agente de IA crea y corrige el código, y lo peligroso (borrar, sobrescribir) necesita tu aprobación.

## Arrancar

```bash
npm install
npm start        # abre la app
npm run dev      # igual, con DevTools abiertas
```

Si abres `renderer/index.html` en el navegador, verás un proyecto de demo (sin acceso al disco).

En el chat:
- `abrir carpeta`: elige la carpeta del proyecto. El agente no puede salir de ella.
- `crea carpeta src` / `crea archivo src/app.js con console.log("hola")`
- `listar archivos`, `borra src/app.js` (pide confirmación)
- `simular ataque` / `corregir`: demo de Supabase con RLS desactivado

## Reglas del código

- **Todo el código en inglés**: variables, comentarios, nombres de archivo y commits.
- **Los textos que ve el usuario, en español**, y solo en `renderer/i18n/es.js` y `electron/strings.js`.
- **MVVM** en el renderer. Los detalles están en [`CLAUDE.md`](CLAUDE.md), que también leen los agentes de IA.

## Ramas (git flow)

| Rama | Para qué |
|---|---|
| `main` | Versión lista para la demo. Solo recibe `release/*` y `hotfix/*`, con tag `vX.Y.Z` |
| `develop` | Integración: aquí se juntan las features |
| `feature/<nombre>` | Una tarea. Sale de `develop` y vuelve a `develop` |
| `release/<versión>` | Congelar y pulir (el corte de la hora 26) |
| `hotfix/<versión>` | Arreglo urgente sobre `main` durante la demo |

```bash
git flow feature start chat-approvals    # empezar una tarea
git flow feature finish chat-approvals   # terminarla (vuelve a develop)
git flow release start 0.2.0             # congelar para la demo
git flow release finish 0.2.0            # pasa a main con tag v0.2.0
```

Nunca se hace commit directo en `main`. Los mensajes de commit van en inglés.

## Estructura

```
electron/            proceso principal: ventana, IPC, confirmaciones, límites del workspace
renderer/
  main.js            arma Models -> ViewModels -> Views
  models/            datos y reglas (proyecto, semáforo, Supabase, agente)
  viewmodels/        estado de pantalla y acciones (mapa, edificio abierto, cámara, chat)
  views/scene/       three.js (mapa, edificio, Supabase, mouse y teclado)
  views/ui/          HTML (chat, paneles, controles, etiquetas)
  i18n/es.js         todos los textos en español
```

## Equipo (4 personas)

| Rol | Carpetas | Primer objetivo |
|---|---|---|
| **Mapa 3D** | `renderer/views/scene/` | Pulir edificios y animaciones; más niveles de carpetas |
| **Electron y archivos** | `electron/` | Pasar las confirmaciones nativas a aprobaciones dentro del chat; comandos de terminal con aprobación |
| **Agente de IA** | `renderer/models/agentModel.js`, `securityModel.js` | Claude Agent SDK con herramientas limitadas al workspace; puntuar archivos con `setScore()` |
| **Supabase y pitch** | `renderer/models/supabaseModel.js`, slides | Leer tablas reales y hallazgos de seguridad en vez de los datos de demo |

Congelar funciones en la hora 26. Desde ahí, solo arreglar errores y ensayar la demo.
