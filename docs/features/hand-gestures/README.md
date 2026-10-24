# Mover el mapa con la mano

Con la cámara encendida, la persona mueve el mapa 3D con un gesto de la mano, sin tocar el mouse.

## Cómo se usa

1. Botón de la mano en los controles del mapa (abajo a la izquierda). La primera vez el sistema pide permiso para la cámara.
2. Aparece una vista previa pequeña de la cámara (como un espejo) con lo que está viendo:
   - «Muestra tu mano a la cámara»: todavía no hay una mano.
   - «Junta pulgar e índice para agarrar el mapa»: hay una mano abierta.
   - «Agarrado: mueve o gira la mano» (punto morado): el pellizco agarró el mapa.
   - «Moviendo el mapa»: la mano se desplaza y el mapa la sigue.
   - «Girando el mapa»: la mano gira como una perilla (la palma queda en su sitio) y el mapa gira en el mismo sentido.
3. Abrir la mano o sacarla de la cámara suelta el mapa. El mismo botón apaga la cámara; cerrar el proyecto también.

Mover o girar se decide al empezar (lo primero que pasa su umbral: la palma se desplaza o la mano gira ~11°) y se mantiene hasta soltar, para que un arrastre no gire el mapa sin querer ni un giro lo desplace. Para cambiar de gesto: soltar y volver a pellizcar.

## Seguridad y privacidad

- Apagado por defecto. La imagen se analiza en este computador (MediaPipe en WASM, modelo local en `renderer/assets/hands/`): no sale a internet.
- Solo video: `electron/main.js` (`allowPermission`) concede la cámara únicamente a la página de la app y niega el micrófono y cualquier otro permiso (salvo copiar al portapapeles). En macOS el sistema pregunta antes.
- La cámara se libera al apagarla (se detienen las pistas del stream).
- La CSP permite `wasm-unsafe-eval` (necesario para el WASM de MediaPipe), sin `unsafe-eval`.

## Archivos

| Pieza | Archivo |
|---|---|
| Cámara → puntos de la mano (MediaPipe, carga diferida) | `renderer/services/handTrackingService.js` |
| Puntos → gesto (pellizco con histéresis, mover o girar, suavizado y zona muerta) | `renderer/models/handGesture.js` |
| Gesto → cámara del mapa (estado, errores, paneo) | `renderer/viewmodels/handControlViewModel.js` |
| Botón y vista previa | `renderer/views/ui/handControlView.js` |
| Modelo de la mano (Google MediaPipe, Apache 2.0) | `renderer/assets/hands/hand_landmarker.task` |

El paneo usa `CameraViewModel.glideBy` y el giro `CameraViewModel.turnBy`; los dos suavizan el salto entre cuadros de la cámara.

## Cómo probarla

- `npm test`: `tests/renderer/handGesture.test.mjs` y `tests/renderer/handControlViewModel.test.mjs`.
- Sin cámara real: Chromium o Electron con `--use-fake-device-for-media-stream` llega hasta «Muestra tu mano a la cámara».
