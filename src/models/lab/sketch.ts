// The Arduino sketch (.ino) for a design: real pins from the wiring, the right includes and libraries, and
// the same behavior the simulation shows (see simulation.ts). Pure: design in, text out.
//
//   sketchFor(design) -> { ok, reason?, code, board, fqbn, libraries, includes, skipped }
//
//   libraries: what to install from the Arduino Library Manager (built-in ones such as Servo and Wire are not
//              listed); includes: the headers the sketch includes
//   skipped:   parts left out of the code and why ("unwired": a pin does not reach the board; "otherBoard";
//              "check": the checker found a fault on it, so no pin of it is written)
//
// The code is the product, so its comments are plain Spanish (like the rest of what people read). Pins come from
// boardPinsOf: Uno D9 -> 9, A0 -> A0, ESP32 GPIO21 -> 21, Pico GP4 -> 4.

import { componentOf, isUserComponent, userEntryOf, type Part } from "./catalog.ts";
import { RESISTOR, boardPinsOf, checkDesign, type Design, type PlacedPart } from "./circuit.ts";
import { NEAR_CM, deadParts } from "./simulation.ts";

export type SkipReason = "unwired" | "otherBoard" | "check";
export type Sketch = {
  ok: boolean;
  reason?: "noBoard";
  code: string;
  board: PlacedPart | null;
  fqbn: string;
  libraries: string[];
  includes: string[];
  skipped: { part: string; why: SkipReason }[];
};

type Family = "avr" | "esp32" | "pico";
type BoardInfo = { name: string; fqbn: string; family: Family; adc: number; baud: number };
const BOARDS: Record<string, BoardInfo> = {
  "arduino-uno": { name: "Arduino Uno", fqbn: "arduino:avr:uno", family: "avr", adc: 1023, baud: 9600 },
  "arduino-nano": { name: "Arduino Nano", fqbn: "arduino:avr:nano", family: "avr", adc: 1023, baud: 9600 },
  "esp32-devkit": { name: "ESP32 DevKit", fqbn: "esp32:esp32:esp32", family: "esp32", adc: 4095, baud: 115200 },
  pico: { name: "Raspberry Pi Pico", fqbn: "rp2040:rp2040:rpipico", family: "pico", adc: 1023, baud: 115200 },
};
const DEFAULT_BOARD: BoardInfo = BOARDS["arduino-uno"];

// Spanish stems for names in the code: LED_1_SIG, DISTANCIA_1_TRIG, distancia1...
const STEM: Record<string, string> = {
  "hc-sr04": "DISTANCIA", pir: "MOVIMIENTO", dht22: "CLIMA", soil: "SUELO", ldr: "LUZ", "servo-sg90": "SERVO",
  relay: "RELE", buzzer: "ZUMBADOR", led: "LED", l298n: "MOTOR", "oled-128x64": "OLED", "lcd-1602-i2c": "LCD",
  button: "BOTON", potentiometer: "POT", "battery-aa4": "PILAS",
};

// A name for the code from an imported part's id: "usr-mq-2" -> "MQ_2"
const userStem = (type: string): string => type.replace(/^usr-/, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase() || "PIEZA";

const none = (): Sketch => ({ ok: false, reason: "noBoard", code: "", board: null, fqbn: "", libraries: [], includes: [], skipped: [] });

// "D9" -> "9", "A0" -> "A0", "GPIO21" -> "21", "GP4" -> "4"; null for a power pin
export function pinExpr(boardPinId: string): string | null {
  const num = /^(?:D|GPIO|GP)(\d+)$/.exec(boardPinId);
  if (num) return num[1];
  return /^A\d+$/.test(boardPinId) ? boardPinId : null;
}

const POWER_ACCEPTS = new Set(["gnd", "5v", "3v3", "vin"]);
const BUS_ACCEPTS = new Set(["sda", "scl"]);

type Used = { part: PlacedPart; spec: Part; n: number; upper: string; lower: string; pin: (id: string) => string };

export function sketchFor(design: Design): Sketch {
  const boards = design.parts.filter((p) => componentOf(p.type)?.kind === "board");
  if (!boards.length) return none();

  // The board the parts are wired to (the first one that has any wire from a part)
  // The resistor is passive: nothing to write for it (the LED's pin is the one on the board side of it)
  const others = design.parts.filter((p) => componentOf(p.type)?.kind === "part" && p.type !== RESISTOR);
  const wiredBoards = new Set(others.flatMap((p) => Object.values(boardPinsOf(design, p.id)).map((l) => l?.board)));
  const board = boards.find((b) => wiredBoards.has(b.id)) ?? boards[0];
  const info = BOARDS[board.type] ?? DEFAULT_BOARD;

  // Parts the checker found faulty are not written (never a pin the checker flagged as wrong)
  const check = checkDesign(design);
  const blocked = new Set(deadParts(design));
  check.issues.filter((i) => i.key === "pinShared" && i.part).forEach((i) => blocked.add(i.part!));
  const warned = new Set(check.issues.filter((i) => i.part && !blocked.has(i.part) && i.key !== "budget").map((i) => i.part!));

  const skipped: Sketch["skipped"] = [];
  const used: Used[] = [];
  const counts = new Map<string, number>();
  const wiring: string[] = [];
  for (const part of others) {
    const spec = componentOf(part.type) as Part;
    const n = (counts.get(part.type) ?? 0) + 1;
    counts.set(part.type, n);
    const links = boardPinsOf(design, part.id);
    const required = spec.pins.filter((p) => p.required);
    if (required.some((p) => !links[p.id])) skipped.push({ part: part.id, why: "unwired" });
    else if (spec.pins.some((p) => links[p.id] && links[p.id]!.board !== board.id)) skipped.push({ part: part.id, why: "otherBoard" });
    else if (blocked.has(part.id)) skipped.push({ part: part.id, why: "check" });
    else {
      const stem = STEM[part.type] ?? (isUserComponent(part.type) ? userStem(part.type) : "PIEZA");
      const pins = spec.pins.filter((p) => links[p.id]).map((p) => `${p.id} -> ${links[p.id]!.pin}`);
      wiring.push(`//   ${part.id}: ${pins.join(", ")}${warned.has(part.id) ? "   (¡tiene avisos en la Revisión del circuito!)" : ""}`);
      used.push({
        part, spec, n, upper: `${stem}_${n}`, lower: `${stem.toLowerCase()}${n}`,
        pin: (id) => pinExpr(links[id]?.pin ?? "") ?? "0", // an optional pin may have no wire
      });
    }
  }

  const includes = new Set<string>();
  const libraries = new Set<string>();
  const consts: string[] = [];
  const globals: string[] = [];
  const setup: string[] = [];
  const inputs: string[] = [];
  const reports: string[] = [];
  const helpers = new Set<string>(); // each helper function once, however many parts need it
  let i2c = false;
  const imported: string[] = []; // placeholders for parts the person imported: we do not know what they do

  // What the actuators react to
  const distances: string[] = [];
  const motions: string[] = [];
  const buttons: string[] = [];
  const climates: { t: string; h: string }[] = [];
  const knobs: string[] = [];
  const label = (u: Used, text: string) => (counts.get(u.part.type)! > 1 ? `${text} ${u.n}` : text);
  const signal = (u: Used) =>
    u.spec.pins
      .filter((p) => !p.accepts.some((k) => POWER_ACCEPTS.has(k) || BUS_ACCEPTS.has(k)))
      .forEach((p) => consts.push(`const int ${u.upper}_${p.id} = ${u.pin(p.id)};`));

  // Pass 1: constants, setup and readings, in the order of the bench
  for (const u of used) {
    const P = (id: string) => `${u.upper}_${id}`;
    switch (u.part.type) {
      case "hc-sr04":
        signal(u);
        setup.push(`  pinMode(${P("TRIG")}, OUTPUT);`, `  pinMode(${P("ECHO")}, INPUT);`);
        inputs.push(`  float ${u.lower} = leerDistancia(${P("TRIG")}, ${P("ECHO")});  // en cm; 0 si no hay eco`);
        reports.push(`    Serial.print("${label(u, "Distancia")}: ");`, `    Serial.print(${u.lower}, 1);`, `    Serial.println(" cm");`);
        distances.push(u.lower);
        helpers.add(
          [
            "// Mide la distancia en cm con el sensor de ultrasonido (devuelve 0 si no hay eco).",
            "float leerDistancia(int trig, int echo) {",
            "  digitalWrite(trig, LOW);",
            "  delayMicroseconds(2);",
            "  digitalWrite(trig, HIGH);",
            "  delayMicroseconds(10);",
            "  digitalWrite(trig, LOW);",
            "  long duracion = pulseIn(echo, HIGH, 30000);  // espera hasta 30 ms (unos 5 m)",
            "  return duracion / 58.0;",
            "}",
          ].join("\n"),
        );
        break;
      case "pir":
        signal(u);
        setup.push(`  pinMode(${P("OUT")}, INPUT);  // el sensor tarda unos segundos en calibrarse al encender`);
        inputs.push(`  bool ${u.lower} = digitalRead(${P("OUT")}) == HIGH;  // true = ve movimiento`);
        reports.push(`    Serial.println(${u.lower} ? "${label(u, "Movimiento")}: detectado" : "${label(u, "Movimiento")}: nada");`);
        motions.push(u.lower);
        break;
      case "button":
        signal(u);
        setup.push(`  pinMode(${P("SIG")}, INPUT_PULLUP);  // sin apretar = HIGH, apretado = LOW`);
        inputs.push(`  bool ${u.lower} = digitalRead(${P("SIG")}) == LOW;  // true = apretado`);
        reports.push(`    Serial.println(${u.lower} ? "${label(u, "Boton")}: apretado" : "${label(u, "Boton")}: suelto");`);
        buttons.push(u.lower);
        break;
      case "dht22": {
        signal(u);
        includes.add("DHT.h");
        libraries.add("DHT sensor library").add("Adafruit Unified Sensor");
        const t = `temperatura${u.n}`, h = `humedad${u.n}`;
        globals.push(`DHT ${u.lower}(${P("DATA")}, DHT22);`);
        setup.push(`  ${u.lower}.begin();`);
        inputs.push(`  float ${t} = ${u.lower}.readTemperature();  // en °C (nan si falla la lectura)`, `  float ${h} = ${u.lower}.readHumidity();     // en %`);
        reports.push(
          `    Serial.print("${label(u, "Temperatura")}: ");`, `    Serial.print(${t}, 1);`, `    Serial.print(" C, humedad: ");`,
          `    Serial.print(${h}, 1);`, `    Serial.println(" %");`,
        );
        climates.push({ t, h });
        break;
      }
      case "soil":
        signal(u);
        inputs.push(`  int ${u.lower} = 100 - (int)(analogRead(${P("AOUT")}) * 100L / ${info.adc});  // % de humedad (100 = muy húmedo; ajústalo a tu sensor)`);
        reports.push(`    Serial.print("${label(u, "Humedad del suelo")}: ");`, `    Serial.print(${u.lower});`, `    Serial.println(" %");`);
        break;
      case "ldr":
        signal(u);
        inputs.push(`  int ${u.lower} = (int)(analogRead(${P("AOUT")}) * 100L / ${info.adc});  // % de luz`);
        reports.push(`    Serial.print("${label(u, "Luz")}: ");`, `    Serial.print(${u.lower});`, `    Serial.println(" %");`);
        break;
      case "potentiometer":
        signal(u);
        inputs.push(`  int ${u.lower} = (int)(analogRead(${P("OUT")}) * 100L / ${info.adc});  // 0 a 100`);
        reports.push(`    Serial.print("${label(u, "Perilla")}: ");`, `    Serial.println(${u.lower});`);
        knobs.push(u.lower);
        break;
      case "led":
      case "buzzer":
      case "relay":
        signal(u);
        setup.push(`  pinMode(${P(u.part.type === "relay" ? "IN" : "SIG")}, OUTPUT);`);
        break;
      case "servo-sg90":
        signal(u);
        includes.add(info.family === "esp32" ? "ESP32Servo.h" : "Servo.h");
        if (info.family === "esp32") libraries.add("ESP32Servo");
        globals.push(`Servo ${u.lower};`);
        setup.push(`  ${u.lower}.attach(${P("SIG")});`);
        break;
      case "l298n":
        signal(u);
        setup.push(`  pinMode(${P("ENA")}, OUTPUT);`, `  pinMode(${P("IN1")}, OUTPUT);`, `  pinMode(${P("IN2")}, OUTPUT);`,
          `  digitalWrite(${P("IN1")}, HIGH);  // el motor gira hacia adelante`, `  digitalWrite(${P("IN2")}, LOW);`);
        break;
      case "oled-128x64":
        i2c = true;
        includes.add("Adafruit_GFX.h").add("Adafruit_SSD1306.h");
        libraries.add("Adafruit SSD1306").add("Adafruit GFX Library");
        globals.push(`Adafruit_SSD1306 ${u.lower}(128, 64, &Wire, -1);`);
        setup.push(
          `  if (!${u.lower}.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {`,
          `    Serial.println("No encuentro la pantalla OLED: revisa SDA y SCL");`,
          `    for (;;) {}`,
          `  }`,
          `  ${u.lower}.setTextSize(1);`,
          `  ${u.lower}.setTextColor(SSD1306_WHITE);`,
        );
        break;
      case "lcd-1602-i2c":
        i2c = true;
        includes.add("LiquidCrystal_I2C.h");
        libraries.add("LiquidCrystal I2C");
        globals.push(`LiquidCrystal_I2C ${u.lower}(0x27, 16, 2);  // si no se ve nada, prueba la dirección 0x3F`);
        setup.push(`  ${u.lower}.init();`, `  ${u.lower}.backlight();`);
        break;
      default:
        if (isUserComponent(u.part.type)) {
          // Imported part: its pins are named, its behavior is not known
          signal(u);
          if (u.spec.pins.some((p) => p.accepts.some((k) => BUS_ACCEPTS.has(k)))) i2c = true;
          // Inside a // comment: no line breaks and no comment closers, whatever the name holds
          const name = (userEntryOf(u.part.type)?.name || u.part.type).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\*\//g, "* /");
          imported.push(
            `  // ${name} ${u.n}: pieza importada. No sé qué hace; escribe aquí cómo leerla o moverla`,
            `  // usando los pines de arriba (${u.spec.pins.filter((p) => !p.accepts.some((k) => POWER_ACCEPTS.has(k))).map((p) => `${u.upper}_${p.id}`).join(", ") || "sin pines de señal"}).`,
          );
        }
        break; // the battery and anything without code
    }
  }

  // Pass 2: what the actuators and displays do, once everything they react to is known
  const near = distances.map((d) => `(${d} > 0 && ${d} < ${NEAR_CM})`);
  const trigger = [...near, ...motions, ...buttons];
  const controlled = trigger.length > 0;
  const actions: string[] = [];
  let usesTrigger = false;
  const blink = (period: number, on: number) => `(millis() % ${period}) < ${on}`;
  for (const u of used) {
    const P = (id: string) => `${u.upper}_${id}`;
    switch (u.part.type) {
      case "led":
      case "buzzer":
      case "relay": {
        const pin = P(u.part.type === "relay" ? "IN" : "SIG");
        const idle = u.part.type === "led" ? blink(1000, 500) : u.part.type === "buzzer" ? blink(1000, 150) : blink(2000, 1000);
        if (controlled) usesTrigger = true;
        const what = { led: "LED", buzzer: "Zumbador", relay: "Relé" }[u.part.type];
        actions.push(
          `  // ${what} ${u.n}: ${controlled ? "se activa con el sensor o el botón" : "sin sensores, se enciende y apaga solo"}`,
          ...(u.part.type === "relay" ? ["  // (muchos módulos de relé se activan con LOW: si funciona al revés, cambia HIGH por LOW)"] : []),
          `  digitalWrite(${pin}, ${controlled ? "disparo" : `(${idle})`} ? HIGH : LOW);`,
        );
        break;
      }
      case "servo-sg90":
        actions.push(`  // Servo ${u.n}: ${distances.length ? "sigue la distancia (5 a 60 cm = 0 a 180 grados)" : "va de 0 a 180 grados y vuelve cada 4 segundos"}`);
        if (distances.length) {
          actions.push(`  if (${distances[0]} > 0) {`, `    ${u.lower}.write(map(constrain((int)${distances[0]}, 5, 60), 5, 60, 0, 180));`, `  }`);
        } else {
          actions.push(
            `  {`, `    long fase = millis() % 4000;`,
            `    ${u.lower}.write((int)(fase < 2000 ? map(fase, 0, 2000, 0, 180) : map(fase, 2000, 4000, 180, 0)));`, `  }`,
          );
        }
        break;
      case "l298n": {
        const how = knobs.length
          ? `map(${knobs[0]}, 0, 100, 0, 255)`
          : distances.length ? `255 - map(constrain((int)${distances[0]}, 5, 60), 5, 60, 0, 255)` : "153";
        actions.push(`  // Motor ${u.n}: ${knobs.length ? "la velocidad la manda la perilla" : distances.length ? "más cerca = más rápido" : "velocidad media"}`);
        if (!knobs.length && distances.length) {
          actions.push(`  static int velocidad${u.n} = 153;`, `  if (${distances[0]} > 0) velocidad${u.n} = ${how};`, `  analogWrite(${P("ENA")}, velocidad${u.n});`);
        } else actions.push(`  analogWrite(${P("ENA")}, ${how});`);
        break;
      }
      case "oled-128x64":
      case "lcd-1602-i2c": {
        const oled = u.part.type === "oled-128x64";
        const w = (text: string) => `${u.lower}.print(${text});`;
        const at = (row: number) => (oled ? `  ${u.lower}.setCursor(0, ${row * 10});` : `  ${u.lower}.setCursor(0, ${row});`);
        const pad = oled ? "" : "    "; // the LCD does not clear itself: spaces cover the old text
        const body: string[] = [];
        if (distances.length) {
          body.push(
            `  if (${distances[0]} > 0) {`, `    ${w('"Dist: "')} ${u.lower}.print(${distances[0]}, 0); ${w(`" cm${pad}"`)}`,
            `  } else {`, `    ${w(`"Sin eco${pad}"`)}`, `  }`,
          );
        } else if (climates.length) {
          const { t, h } = climates[0];
          body.push(
            `  if (!isnan(${t})) {`, `    ${w('"Temp: "')} ${u.lower}.print(${t}, 1); ${w(`" C${pad}"`)}`, `  }`,
            at(1), `  if (!isnan(${h})) {`, `    ${w('"Hum: "')} ${u.lower}.print(${h}, 1); ${w(`" %${pad}"`)}`, `  }`,
          );
        } else {
          body.push(w('"Hola!"'), at(1), `  ${u.lower}.print(millis() / 1000); ${w(`" s${pad}"`)}`);
        }
        actions.push(
          `  // Pantalla ${oled ? "OLED" : "LCD"} ${u.n}: ${distances.length ? "muestra la distancia" : climates.length ? "muestra la temperatura y la humedad" : "saluda y cuenta segundos"}`,
          ...(oled ? [`  ${u.lower}.clearDisplay();`] : []),
          at(0),
          ...body,
          ...(oled ? [`  ${u.lower}.display();`] : []),
        );
        break;
      }
      default:
        break;
    }
  }
  if (usesTrigger) actions.unshift(`  // disparo: algo que activa las salidas (algo cerca, movimiento o botón apretado)`, `  bool disparo = ${trigger.join(" || ")};`);

  // The text
  const libList = [...libraries];
  const skipText: Record<SkipReason, string> = {
    unwired: "falta conectarla",
    otherBoard: "está conectada a otra placa",
    check: "revisa su cableado en la Revisión del circuito",
  };
  const out: string[] = [
    `// Sketch de Qubbot para ${info.name}, hecho a partir de tu circuito.`,
    `// Placa en el IDE de Arduino: ${info.name} (${info.fqbn}).`,
    ...(libList.length ? [`// Instala estas librerías (Herramientas > Administrar bibliotecas): ${libList.join(", ")}.`] : []),
    ...(wiring.length ? ["//", "// Cableado (pieza: pin de la pieza -> pin de la placa):", ...wiring] : []),
    "",
    ...(i2c ? ["#include <Wire.h>"] : []),
    ...[...includes].map((h) => `#include <${h}>`),
    ...(i2c || includes.size ? [""] : []),
    ...(consts.length ? ["// Pines (los que cableaste)", ...consts, ""] : []),
    ...(globals.length ? ["// Piezas", ...globals, ""] : []),
    ...(reports.length ? ["unsigned long ultimoInforme = 0;  // para informar cada medio segundo", ""] : []),
    ...[...helpers].flatMap((h) => [h, ""]),
    "void setup() {",
    `  Serial.begin(${info.baud});`,
    ...(i2c ? [`  Wire.begin();  // el bus I2C usa los pines SDA y SCL de la placa`] : []),
    ...setup,
    "}",
    "",
    "void loop() {",
    ...(inputs.length ? ["  // 1. Leer los sensores", ...inputs, ""] : []),
    ...(actions.length ? ["  // 2. Mover las salidas", ...actions, ""] : []),
    ...(reports.length
      ? ["  // 3. Contar lo que pasa por el monitor serie", "  if (millis() - ultimoInforme >= 500) {", "    ultimoInforme = millis();", ...reports, "  }", ""]
      : []),
    ...(imported.length ? ["  // Piezas importadas", ...imported, ""] : []),
    ...(!inputs.length && !actions.length && !imported.length ? ["  // Aún no hay piezas conectadas: cuando las conectes, aquí aparece su código.", ""] : []),
    ...skipped.map((s) => `  // ${s.part}: ${skipText[s.why]}`),
    ...(skipped.length ? [""] : []),
    "  delay(50);",
    "}",
    "",
  ];
  const code = out.join("\n");
  return { ok: true, code, board, fqbn: info.fqbn, libraries: libList, includes: [...(i2c ? ["Wire.h"] : []), ...includes], skipped };
}
