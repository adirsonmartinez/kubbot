# MEMORY — Qubbot Lab (repo kubbot)

Estado vivo del proyecto. Léelo al empezar cada tarea y actualízalo al terminar. La skill `.claude/skills/kubbot-lab/` explica cómo trabajar aquí.

## Qué es
- **Producto:** Qubbot, laboratorio de sistemas Arduino en 3D. El bot se llama Qubi.
- **Origen:**
  - Viene del ADE «Qubbot» del hackathon (repo `team-12`), que queda como está.
  - El prototipo Electron del laboratorio está en `/Users/jesus/orca/projects/qubbot-3d` (rama `feature/laboratorio-arduino`), y su contexto en `docs/CONTEXTO-LABORATORIO.md`.
- **Este repo:** `adirsonmartinez/kubbot`, en Next.js 16, React Three Fiber y TypeScript, con MVVM. Despliega en Render (`render.yaml`).
- **Jurado:** originalidad 15 %, ambición 20 %, ejecución 20 %, técnica 25 %, impacto 20 %. La demo dura 3 minutos; usar modo oscuro.

## Ramas
- `main` y `develop` son las del equipo.
- `feature/laboratorio-arduino` tiene todo el laboratorio. Local, sin commit al 2026-10-25.

## Hecho (2026-10-25)
- Laboratorio completo e integrado en `WorkspaceScreen`: catálogo, banco 3D con 19 piezas modeladas, cables con corriente, verificador, simulación, código `.ino`, caja STL/OpenSCAD y chat con herramientas (Claude o sin IA).
- `npm test` pasa 258 pruebas. `typecheck`, `lint` y `build` limpios.
- Probado de punta a punta en Chrome headless (CDP, `scratchpad/drive.mjs`), sin errores en la consola.
- Landing nueva: https://claude.ai/artifact/LNAuuqUinWjFn1eNgzuUHn. Sus CTA apuntan a la sección final hasta tener la URL de Render.

## Pendiente
- Pulido visual en curso:
  - colocación compacta de piezas;
  - encuadre que respete los paneles;
  - la barra que pisa los controles;
  - un glifo suelto;
  - chips del chat.
- Subir la rama y abrir el PR a `develop`; falta confirmar qué rama publica Render.
- Lo de `docs/laboratorio/README.md` → «Pendiente».

## Aprendizajes
- **Pruebas:** Node 24 corre `.ts` directo. Los modelos se importan entre sí con extensión `.ts` (`allowImportingTsExtensions`), y las pruebas los importan de forma relativa.
- **Arrastre:** `MapInput` escucha el canvas antes que R3F; `benchInput.claims` evita que arrastrar una pieza mueva el mapa.
- **Chat con Claude:** el pensamiento está siempre activo, así que el cliente reenvía `content` (con sus bloques de pensamiento) junto con los resultados de las herramientas.
