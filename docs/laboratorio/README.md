# Qubbot Lab: laboratorio de sistemas Arduino

Qubbot es un laboratorio para armar sistemas Arduino en 3D, conversando con Qubi. Cuatro pasos:

1. Arrastras placas, sensores y motores del catálogo a un banco isométrico.
2. Las conectas tú, o le pides a Qubi que lo haga.
3. Un verificador con reglas fijas, que no es IA, revisa que nada se queme.
4. Simulas, y te llevas el código para la placa y la caja para imprimir en 3D.

Principio: **la IA propone, el verificador decide.**

## Qué hay

| Parte | Dónde | Qué hace |
|---|---|---|
| Catálogo | `src/models/lab/catalog.ts` | 4 placas (Uno, Nano, ESP32, Pico) y 15 piezas. Cada una con medidas en mm, pines, voltaje, consumo y la fuente de sus medidas con su licencia. |
| Circuito y verificador | `src/models/lab/circuit.ts` | Pone, mueve, gira y quita piezas, y conecta y desconecta cables. `checkDesign` marca en rojo los cortos, la mezcla de 5 V con 3,3 V y el voltaje de más; en amarillo los cables que faltan, el pin equivocado, el pin compartido, los 5 V que llegan a una placa de 3,3 V y la falta de corriente. `autoWire` conecta solo, cuidando los pines escasos y los pines de arranque del ESP32. |
| Banco | `src/models/lab/layout.ts`, `src/views/scene/lab/` | Dónde va cada pin. Muestra las piezas en 3D, los cables con corriente animada, el arrastre y la caja. |
| Estado | `src/models/lab/bench.ts`, `src/viewmodels/useLabViewModel.ts` | El reductor puro del banco y el hook que guarda en el navegador y descarga archivos. |
| Simulación | `src/models/lab/simulation.ts` | Determinista. El sensor de distancia mueve el servo y enciende el LED y el zumbador; las pantallas muestran la lectura. Una pieza mal conectada no se mueve. |
| Código | `src/models/lab/sketch.ts` | Genera el `.ino` con los pines reales del cableado y las librerías que hay que instalar. |
| Caja | `src/models/lab/enclosure.ts` | Caja paramétrica con separadores M3, huecos y tapa. Exporta STL binario, sin dependencias, y OpenSCAD. |
| Chat | `src/app/api/agent/route.ts`, `src/models/lab/agentTools.ts`, `src/models/lab/assistant.ts` | Qubi usa Claude con herramientas que el navegador ejecuta y el verificador valida. Sin clave, responde un asistente con reglas, marcado «sin IA». |
| Interfaz | `src/views/components/lab/` | Catálogo, revisión del circuito, barra de herramientas y arrastrar y soltar. |
| Textos | `src/views/copy/lab.ts` | Todo el texto visible, en español sencillo. |

## Cómo probar

- `npm test` corre las pruebas de los modelos y de las piezas 3D.
- `npm run typecheck`, `npm run lint` y `npm run build` deben pasar.
- `npm run dev` levanta la app. El recorrido de la demo:
  1. Catálogo → Arduino Uno, sensor de distancia y servo.
  2. «Conectar solo».
  3. «Simular».
  4. Caja → «Ver la caja» → «Ver por dentro».
  5. En el chat, «¿Qué puedo construir?».

## Despliegue

En Render, con el blueprint `render.yaml`: Node 24, `npm ci && npm run build` y `npm run start`.

- **`ANTHROPIC_API_KEY`:** opcional, en el panel de Render. Sin ella, el chat usa el asistente sin IA.
- **`QUBBOT_MODEL`:** opcional; por defecto `claude-opus-5-5`.

## Pendiente

- Validar fichas de componentes externos (marketplace).
- Más piezas en el catálogo: sensores IR para un seguidor de línea, un segundo canal de motor.
- Posiciones del USB y del jack en el catálogo, para que la caja haga esos huecos con precisión.
- Avisos que el verificador aún no da y Qubi debe decir en el chat: LED sin resistencia, zumbador por encima de 20 mA en un pin del Uno.
