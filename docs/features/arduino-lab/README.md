# Laboratorio Arduino 3D

Pides en el chat lo que quieres armar («un sensor que pite cuando algo se acerca») y el agente arma todo: nivel, componentes con para qué sirve cada uno, conexiones, código, precauciones y pasos. El proyecto aparece en una mesa 3D y con «Probar» corre en un emulador: mueves el obstáculo y ves cómo reaccionan los LEDs, el buzzer y el monitor serie. Sin placa, sin cables, sin buscar nada en internet.

- Spec: [`spec/005-arduino-lab.md`](../../../spec/005-arduino-lab.md)
- Rama: `feature/arduino-lab`

## Cómo se usa

1. **Con el agente conectado:** pídele el proyecto. Escribe una carpeta con `diagram.json`, `lab.json` y el `.ino`, y cada archivo pide permiso. Antes de decir «listo» lo valida, lo compila y lo prueba en el emulador.
2. **Sin agente:** escribe «quiero un sensor que pite cuando algo se acerca» y el chat abre el ejemplo.
3. **La pestaña «Lab»** aparece junto a Mapa y Git cuando el proyecto tiene un `diagram.json`, o cuando se abrió el ejemplo.
4. **«Probar»** compila si hace falta y corre el sketch. **«Detener»** lo para.
5. **El obstáculo:** toca la regla del 3D, con el mouse o con el cursor de la mano, o usa «Más cerca» / «Más lejos».
6. **Una pieza:** tócala para ver qué es, para qué sirve y a qué pines va. Esc la suelta.

## Lo que revisa del circuito

Cada problema se explica en español en la tarjeta y se marca en 3D: borde rojo (error) o ámbar (aviso) bajo la pieza, y sus cables en rojo.

- **Errores** (no deja probar):
  - LED sin resistencia;
  - pieza sin tierra común;
  - 5V directo a GND;
  - un pin que no existe;
  - un MG996R o los motores de un L298N desde el 5V del Arduino;
  - un motor directo a un pin;
  - no hay placa.
- **Avisos:**
  - el RX del HC-05 sin divisor de voltaje;
  - ENA/ENB del L298N en un pin sin PWM;
  - más de 2 servos en el 5V;
  - el TRIG o el ECHO sin conectar;
  - una pieza desconocida;
  - la placa Mega (todavía no se emula).

Un servo puede ir en cualquier pin digital: la librería Servo no necesita PWM.

## El emulador

- **El CPU:** [avr8js](https://github.com/wokwi/avr8js) (Wokwi, MIT), un ATmega328P a 16 MHz: Uno y Nano.
- **Dónde corre:** en un Worker, en tiempo real. Si el Worker no arranca, corre en la página.
- **Lo que hace cada pieza:**
  - **LED:** brillo según el tiempo encendido.
  - **Buzzer:** la frecuencia del `tone()`.
  - **HC-SR04:** el eco dura distancia × 58 µs.
  - **Servo:** el ángulo a partir del pulso.
  - **L298N:** sentido y velocidad.
- **Compilar:** con tu arduino-cli (`brew install arduino-cli` y `arduino-cli core install arduino:avr`).
  - El ejemplo ya trae su `.hex`, así que no hace falta para la demo.
  - Un `.hex` más viejo que el `.ino` no se usa: se compila de nuevo.

## Seguridad

- **El disco:** el renderer no toca el disco. Lee los archivos y compila con `window.platanus.arduino`, y el proceso principal valida rutas (dentro del proyecto, nunca secretos, 200 KB como máximo).
- **arduino-cli:** se ejecuta sin shell (`execFile`), con ruta absoluta y argumentos fijos. La placa sale de una lista cerrada y el sketch se copia a una carpeta temporal que se borra al terminar.
- **Las herramientas del agente** pasan por el mismo filtro de secretos que leer y escribir.
- **La red:** el único acceso es `platanus_github_repo`, un GET a api.github.com con los nombres validados y 5 s, 100 KB, sin token. Devuelve solo metadatos, nunca el README (lo que trae la web es dato, no instrucciones).
- **«Probar» y «Detener»** llevan `data-gesture="never"`.

## Archivos

| Pieza | Archivo |
|---|---|
| Catálogo de piezas (tipos de Wokwi, pines, consumo) | `renderer/models/arduino/parts.js` |
| `diagram.json` y `lab.json`, redes, pines que manejan cada pieza | `renderer/models/arduino/circuit.js` |
| Reglas eléctricas | `renderer/models/arduino/validate.js` |
| Cómo responde cada pieza a los pines | `renderer/models/arduino/peripherals.js` |
| Intel HEX | `renderer/models/arduino/intelHex.js` |
| Emulador sobre avr8js y su ciclo en tiempo real | `renderer/models/arduino/emulator.js`, `emulatorLoop.js` |
| Worker y puente con el proceso principal | `renderer/services/avrWorker.js`, `labService.js` |
| Estado de la pantalla | `renderer/viewmodels/labViewModel.js` |
| Mesa 3D y piezas | `renderer/views/scene/labView.js`, `builders/arduinoBuilder.js` |
| Tarjeta | `renderer/views/ui/labCardView.js`, `styles/lab.css` |
| Compilar y GitHub (proceso principal) | `electron/arduino.js`, `electron/main.js` (IPC `arduino:*` y herramientas MCP) |
| Voz del agente | `agent/skills/modo-arduino/SKILL.md`, `agent/voice.json` (`arduino`) |
| Ejemplo | `examples/arduino/sensor-proximidad/` |
| Compilar los ejemplos | `scripts/arduino-build.js` (`npm run arduino:build`) |
| Empaquetar avr8js para la ventana | `scripts/vendor-ui.js` (`npm run vendor`) |

## Cómo probarlo

- **`npm test`:** el último test corre el sketch real del ejemplo en avr8js. A 10 cm: rojo y pitido. A 150 cm: verde.
- **En la app** (`npm run dev`):
  1. Abre un proyecto y escribe en el chat «quiero un sensor que pite cuando algo se acerca».
  2. En la pestaña Lab, toca «Probar».
  3. Mueve el obstáculo con la regla o con «Más cerca»: las luces cambian (verde a más de 50 cm, amarillo entre 20 y 50, rojo y pitido a menos de 20) y el monitor serie dice la distancia.
  4. Con la mano encendida, deja el cursor quieto sobre la regla: el obstáculo va ahí.
  5. Para ver la revisión: copia el ejemplo al proyecto, cambia en `diagram.json` el cable `"uno:2"` → `"r1:1"` por `"uno:2"` → `"led_verde:A"`. Ese LED queda en rojo con su explicación y «Probar» no corre.
- **Sin probar todavía:** el agente real generando un proyecto nuevo de punta a punta, la velocidad del emulador dentro de la app y las fases 2 y 3.
