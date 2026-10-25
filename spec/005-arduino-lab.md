# 005 · Laboratorio Arduino 3D

Rama: `feature/arduino-lab` (sale de `feature/hand-gestures`). Fase 1, para la demo de Platanus Hack 26.

## Contexto

Aprender Arduino cuesta porque hay que juntar mucha información: qué piezas comprar, cómo conectarlas, qué código escribir y qué cuidar para no quemar nada. Además, los proyectos que circulan en internet suelen traer enlaces rotos, placas que no coinciden o código sin licencia. De los cuatro proyectos de ejemplo que trajimos, solo uno coincidía con su enlace.

En Qubbot la persona le pide al chat lo que quiere («un sensor que pite cuando algo se acerca»). El agente arma el proyecto completo y comprobado, el proyecto aparece en una mesa de laboratorio 3D y corre en un emulador, sin placa real.

## Comportamiento esperado

### El proyecto

- **A1.** Un proyecto de laboratorio es una carpeta con tres archivos:
  - `diagram.json`, en el formato de Wokwi (también abre en wokwi.com);
  - `lab.json`: nivel, objetivo, componentes con cantidad y para qué sirven, pasos, precauciones y fuentes;
  - un sketch `.ino`.
- **A2.** WHEN el proyecto abierto tiene un `diagram.json` (en la raíz o hasta 3 niveles abajo; gana el menos profundo), THE SYSTEM SHALL mostrar la pestaña «Lab» junto a Mapa y Git. Si los archivos cambian (por ejemplo, porque el agente los escribe), el laboratorio se recarga.
- **A3.** WHEN la persona toca un `.ino` en el mapa y ese proyecto tiene laboratorio, THE SYSTEM SHALL abrir también la pestaña Lab.
- **A4.** La app trae un ejemplo (`examples/arduino/sensor-proximidad/`) con su `.hex` ya compilado, para que funcione sin red y sin arduino-cli.

### La mesa 3D

- **B1.** Las piezas van donde dice `diagram.json`: sus píxeles de Wokwi divididos por 40. Si están casi todas en el mismo lugar, se ponen en fila sobre la placa.
- **B2.** Los cables se dibujan como arcos entre pines, con su color. Un cable «black» se ve gris oscuro.
- **B3.** Solo brillan dos cosas:
  - un LED encendido, según su brillo;
  - un problema: borde rojo (error) o ámbar (aviso) bajo la pieza, y sus cables en rojo si es un error.

  El buzzer muestra un anillo morado mientras suena.
- **B4.** Delante de cada HC-SR04 hay una regla de 2 m y un obstáculo.
  - Tocar la regla, con el mouse o con el cursor de la mano, mueve el obstáculo ahí.
  - En la tarjeta, «Más cerca» y «Más lejos» lo mueven de a 10 cm.
- **B5.** Tocar una pieza la selecciona: la tarjeta dice qué es, para qué sirve y a qué pines va. Esc la suelta.

### La tarjeta

- **C1.** Muestra:
  - título y nivel;
  - estado (listo, compilando, corriendo, error);
  - «Probar» y «Detener», que llevan `data-gesture="never"` porque corren código sin pedir confirmación;
  - el obstáculo;
  - la revisión del circuito;
  - el monitor serie (las últimas líneas);
  - la pieza seleccionada;
  - componentes, pasos y precauciones.

### Las reglas eléctricas (`models/arduino/validate.js`)

- **D1.** THE SYSTEM SHALL revisar el circuito y explicar cada problema en español.
  - **Errores:** falta la placa, un pin que no existe, 5V directo a GND, un LED sin resistencia, una pieza sin tierra común, un MG996R o los motores de un L298N alimentados desde el 5V del Arduino, un motor directo a un pin.
  - **Avisos:** una pieza desconocida, una placa que todavía no se emula, ENA/ENB del L298N en un pin sin PWM, el RX del HC-05 sin divisor, un pin con muchos LEDs, más de 2 servos en el 5V, el TRIG o el ECHO del sensor sin conectar.
- **D2.** WHEN hay errores, «Probar» no corre y dice por qué.
- **D3.** Un servo fuera de un pin PWM **no** es un problema: la librería Servo maneja cualquier pin digital (corrige lo que decía el prompt).

### El emulador

- **E1.** El CPU es avr8js (Wokwi, MIT): un ATmega328P a 16 MHz (Uno y Nano). La Mega todavía no se emula (fase 3).
- **E2.** Corre en un Worker en tiempo real.
  - Cada ~33 ms emula el tiempo que pasó, como máximo 100 ms, para que una computadora lenta se atrase en vez de trabarse.
  - Solo vuelve a la página lo que muestran las piezas y el texto serie.
  - Si el Worker no arranca, el mismo ciclo corre en la página.
- **E3.** Lo que hace cada pieza (`models/arduino/peripherals.js`):
  - **LED:** brillo según el tiempo encendido.
  - **Buzzer:** frecuencia según los flancos del pin.
  - **HC-SR04:** con TRIG en alto 10 µs o más, ECHO sube a los 0,45 ms y dura distancia × 58 µs; más allá de 4 m, 38 ms.
  - **Servo:** pulsos de Servo.h (544 µs = 0°, 2400 µs = 180°).
  - **L298N:** su tabla de verdad.
- **E4.** WHEN no hay un `.hex` al día, THE SYSTEM SHALL compilar con el arduino-cli de la persona.
  - Se ejecuta con `execFile`, sin shell, con ruta absoluta y argumentos fijos.
  - La placa sale de una lista cerrada: `arduino:avr:uno`, `:nano`, `:mega`.
  - El sketch se copia a una carpeta temporal.
  - Tiene tiempo límite, la salida acotada y los errores resumidos.
  - Sin CLI o sin el core AVR, la tarjeta dice cómo instalarlos.

### El agente

- **F1.** Tiene cinco herramientas MCP nuevas:
  - `platanus_arduino_parts`: el catálogo de piezas;
  - `platanus_arduino_validate`: las reglas, con su explicación;
  - `platanus_arduino_compile`;
  - `platanus_arduino_test`: corre el emulador con el obstáculo a varias distancias y devuelve LEDs, buzzer y monitor serie;
  - `platanus_github_repo`.
- **F2.** `platanus_github_repo` solo hace un GET a `api.github.com/repos/{owner}/{repo}`.
  - Valida los nombres antes de pedir nada.
  - Tiempo límite de 5 s, 100 KB como máximo, sin token.
  - Sigue un solo redirect, y solo dentro de api.github.com.
  - Devuelve: si existe, descripción, licencia SPDX, si está archivado, el último push y si se movió. Nunca el README.
- **F3.** La skill `agent/skills/modo-arduino` se agrega al prompt cuando la conversación habla de Arduino. Pide:
  - explicar como profe;
  - escribir código propio;
  - mencionar solo enlaces comprobados;
  - validar, compilar y probar antes de decir «listo»;
  - adaptar lo que no se emula, como el ESP8266 → HC-05;
  - seguridad física.
- **F4.** Sin agente conectado, el chat guionado responde a un pedido de Arduino abriendo el ejemplo en el laboratorio.

## Out of scope (fase 2 y 3)

- **Fase 2:** servos animados en 3D (Otto, brazo), el L298N con ruedas que giran, el HC-05 con un control de teléfono, joysticks (ADC).
- **Fase 3:** la Mega, más piezas y subir el sketch a una placa real (siempre con permiso).
- **Fuera de alcance:** el Wi-Fi del ESP8266, que no se emula.

## Checklist de dominio

- [x] El renderer no toca el disco: lee y compila a través de `window.platanus.arduino` (preload) y el proceso principal valida.
- [x] Nada de red durante la demo: el ejemplo trae su `.hex` y el emulador está en `renderer/vendor/avr8js.js`.
- [x] Las rutas del agente pasan por el mismo filtro de secretos (`PATH_TOOLS` en `mcpServer.js`).
- [x] `allowPermission`, la CSP y las opciones de los agentes no cambian.
- [x] Textos en `renderer/i18n/es.js` (`strings.lab`) e ícono de Hugeicons (`chip`).

## Plan de validación

- `npm test`:
  - `arduinoModels`: circuito, reglas, piezas, HEX;
  - `arduinoEmulator`: un CPU falso y el sketch real en avr8js;
  - `labViewModel`;
  - `arduinoAgent`;
  - `electron/arduino.test.js`: compilación y GitHub;
  - `mcpServer` y `agentVoice`.
- **Medido en Node:** con el sketch real, 1 s de emulación toma ~0,25–0,33 s (unas 3 a 4 veces más rápido que el tiempo real).
  - A 10 cm: LED rojo y ~1550 Hz, «Distancia: 9 cm».
  - A 35 cm: amarillo.
  - A 150 cm: verde.
  - A 500 cm: verde y «0 cm».
- **Manual en la app:** ver `docs/features/arduino-lab/README.md` → «Cómo probarlo».

## Rollout

Rama `feature/arduino-lab`. Se une a `develop` solo si la demo en vivo funciona en la laptop de la presentación.

## Decisiones abiertas

- La Mega: emular el ATmega2560 con avr8js o dejarla solo para dibujar y compilar.
- `platanus_arduino_test` corre en el proceso principal y lo frena alrededor de 1 s. Si se usa mucho, se puede mover a un `worker_threads`.
