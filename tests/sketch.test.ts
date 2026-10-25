import test from "node:test";
import assert from "node:assert/strict";
import { addPart, autoWire, connect, emptyDesign, type Design } from "../src/models/lab/circuit.ts";
import { COMPONENTS } from "../src/models/lab/catalog.ts";
import { pinExpr, sketchFor } from "../src/models/lab/sketch.ts";

// A board plus parts, each one auto-wired in turn
function benchMany(board: string, ...types: string[]) {
  let design = addPart(emptyDesign(), board, { x: 0, z: 0 }).design;
  types.forEach((type, i) => {
    const r = addPart(design, type, { x: 8 * (i + 1), z: 0 });
    design = autoWire(r.design, r.id!).design;
  });
  return design;
}
// One part wired by hand to the exact board pins in `pins` (part pin -> board pin)
function hand(board: string, type: string, pins: Record<string, string>): Design {
  let d = addPart(emptyDesign(), board).design;
  const r = addPart(d, type, { x: 8 });
  d = r.design;
  for (const [pin, boardPin] of Object.entries(pins)) d = connect(d, { part: r.id!, pin }, { part: `${board}-1`, pin: boardPin }).design;
  return d;
}
const balanced = (code: string) => {
  for (const [open, close] of [["{", "}"], ["(", ")"], ["[", "]"]]) assert.equal(code.split(open).length, code.split(close).length, `${open}${close}`);
};

test("no board: ok false with reason noBoard, and the same shape", () => {
  const d = addPart(addPart(emptyDesign(), "led").design, "hc-sr04").design;
  const s = sketchFor(d);
  assert.deepEqual(s, { ok: false, reason: "noBoard", code: "", board: null, fqbn: "", libraries: [], includes: [], skipped: [] });
  assert.equal(sketchFor(emptyDesign()).reason, "noBoard");
});

test("an empty bench with a board still gives a valid empty sketch", () => {
  const s = sketchFor(addPart(emptyDesign(), "arduino-uno").design);
  assert.equal(s.ok, true);
  assert.match(s.code, /void setup\(\) \{/);
  assert.match(s.code, /void loop\(\) \{/);
  assert.match(s.code, /Aún no hay piezas conectadas/);
  assert.equal(s.board?.id, "arduino-uno-1");
  assert.equal(s.fqbn, "arduino:avr:uno");
  assert.deepEqual(s.libraries, []);
});

test("pin names: Uno D9 -> 9, A0 -> A0, ESP32 GPIO21 -> 21, Pico GP4 -> 4", () => {
  assert.equal(pinExpr("D9"), "9");
  assert.equal(pinExpr("A0"), "A0");
  assert.equal(pinExpr("GPIO21"), "21");
  assert.equal(pinExpr("GP4"), "4");
  assert.equal(pinExpr("5V"), null);
  assert.equal(pinExpr("GND"), null);
  assert.equal(pinExpr("VBUS"), null);
});

test("the code uses the real wired pins on every board", () => {
  const uno = sketchFor(hand("arduino-uno", "led", { SIG: "D9", GND: "GND" }));
  assert.match(uno.code, /const int LED_1_SIG = 9;/);
  assert.match(uno.code, /pinMode\(LED_1_SIG, OUTPUT\);/);
  const pot = sketchFor(hand("arduino-uno", "potentiometer", { VCC: "5V", OUT: "A0", GND: "GND" }));
  assert.match(pot.code, /const int POT_1_OUT = A0;/);
  assert.match(pot.code, /analogRead\(POT_1_OUT\) \* 100L \/ 1023/);
  const esp = sketchFor(hand("esp32-devkit", "led", { SIG: "GPIO21", GND: "GND" }));
  assert.match(esp.code, /const int LED_1_SIG = 21;/);
  assert.doesNotMatch(esp.code, /= IO21|= GPIO/, "the pin is a number, not a name");
  assert.match(esp.code, /Serial\.begin\(115200\)/);
  const espPot = sketchFor(hand("esp32-devkit", "potentiometer", { VCC: "3V3", OUT: "GPIO34", GND: "GND" }));
  assert.match(espPot.code, /const int POT_1_OUT = 34;/);
  assert.match(espPot.code, /\/ 4095/, "the ESP32 reads 12 bits");
  const pico = sketchFor(hand("pico", "led", { SIG: "GP4", GND: "GND" }));
  assert.match(pico.code, /const int LED_1_SIG = 4;/);
  assert.equal(pico.fqbn, "rp2040:rp2040:rpipico");
  const picoPot = sketchFor(hand("pico", "potentiometer", { VCC: "3V3", OUT: "GP26", GND: "GND" }));
  assert.match(picoPot.code, /const int POT_1_OUT = 26;/);
});

test("HC-SR04 + servo + LED: pins, pulseIn with a timeout, servo follows the distance", () => {
  const d = benchMany("arduino-uno", "hc-sr04", "servo-sg90", "led");
  const s = sketchFor(d);
  assert.equal(s.ok, true);
  // autoWire on the Uno: TRIG D2, ECHO D4, servo D3, LED D7
  assert.match(s.code, /const int DISTANCIA_1_TRIG = 2;/);
  assert.match(s.code, /const int DISTANCIA_1_ECHO = 4;/);
  assert.match(s.code, /servo1\.attach\(SERVO_1_SIG\);/);
  assert.match(s.code, /const int SERVO_1_SIG = 3;/);
  assert.match(s.code, /const int LED_1_SIG = 7;/);
  assert.match(s.code, /pulseIn\(echo, HIGH, 30000\)/, "a timeout, so a missing echo does not freeze the loop");
  assert.match(s.code, /servo1\.write\(map\(constrain\(\(int\)distancia1, 5, 60\), 5, 60, 0, 180\)\)/);
  assert.match(s.code, /digitalWrite\(LED_1_SIG, disparo \? HIGH : LOW\)/);
  assert.match(s.code, /bool disparo = \(distancia1 > 0 && distancia1 < 20\);/);
  assert.ok(s.includes.includes("Servo.h"));
  assert.deepEqual(s.libraries, [], "Servo is built in on the Uno");
  balanced(s.code);
});

test("the cabling is written at the top, with the board's own pin names", () => {
  const s = sketchFor(benchMany("arduino-uno", "led"));
  assert.match(s.code, /\/\/   led-1: SIG -> D\d+, GND -> GND/);
  const esp = sketchFor(benchMany("esp32-devkit", "led"));
  assert.match(esp.code, /\/\/   led-1: SIG -> GPIO\d+, GND -> GND/);
});

test("libraries and includes per part", () => {
  const dht = sketchFor(benchMany("arduino-uno", "dht22"));
  assert.deepEqual(dht.libraries, ["DHT sensor library", "Adafruit Unified Sensor"]);
  assert.deepEqual(dht.includes, ["DHT.h"]);
  assert.match(dht.code, /#include <DHT\.h>/);
  assert.match(dht.code, /DHT clima1\(CLIMA_1_DATA, DHT22\);/, "the real pin, not a placeholder");
  assert.match(dht.code, /clima1\.begin\(\);/);
  assert.match(dht.code, /readTemperature\(\)/);
  const oled = sketchFor(benchMany("arduino-uno", "oled-128x64"));
  assert.deepEqual(oled.libraries, ["Adafruit SSD1306", "Adafruit GFX Library"]);
  assert.deepEqual(oled.includes, ["Wire.h", "Adafruit_GFX.h", "Adafruit_SSD1306.h"]);
  assert.match(oled.code, /oled1\.begin\(SSD1306_SWITCHCAPVCC, 0x3C\)/);
  assert.match(oled.code, /oled1\.setTextColor\(SSD1306_WHITE\)/);
  assert.match(oled.code, /Wire\.begin\(\)/);
  const lcd = sketchFor(benchMany("arduino-uno", "lcd-1602-i2c"));
  assert.deepEqual(lcd.libraries, ["LiquidCrystal I2C"]);
  assert.match(lcd.code, /#include <LiquidCrystal_I2C\.h>/);
  assert.match(lcd.code, /LiquidCrystal_I2C lcd1\(0x27, 16, 2\)/);
  assert.match(lcd.code, /lcd1\.init\(\);/);
  assert.match(lcd.code, /lcd1\.backlight\(\);/);
  const esp = sketchFor(benchMany("esp32-devkit", "servo-sg90"));
  assert.deepEqual(esp.libraries, ["ESP32Servo"]);
  assert.match(esp.code, /#include <ESP32Servo\.h>/);
  assert.doesNotMatch(esp.code, /#include <Servo\.h>/);
  // a sketch never lists a library it does not use
  const led = sketchFor(benchMany("arduino-uno", "led"));
  assert.deepEqual(led.libraries, []);
  assert.doesNotMatch(led.code, /#include/);
});

test("I2C: the OLED and the LCD share SDA and SCL and the code never touches those pins", () => {
  const s = sketchFor(benchMany("arduino-uno", "oled-128x64", "lcd-1602-i2c"));
  assert.match(s.code, /oled-128x64-1: VCC -> 5V, SDA -> A4, SCL -> A5, GND -> GND/);
  assert.match(s.code, /lcd-1602-i2c-1: VCC -> 5V, SDA -> A4, SCL -> A5, GND -> GND/);
  assert.doesNotMatch(s.code, /pinMode\(A4|pinMode\(A5/, "pinMode on SDA/SCL would break the bus");
  assert.equal(s.code.match(/Wire\.begin\(\)/g)?.length, 1);
  assert.doesNotMatch(s.code, /const int (OLED|LCD)/);
  balanced(s.code);
});

test("the button uses INPUT_PULLUP and drives the LED, not a hardcoded pin 13", () => {
  const s = sketchFor(benchMany("arduino-uno", "button", "led"));
  assert.match(s.code, /pinMode\(BOTON_1_SIG, INPUT_PULLUP\)/);
  assert.match(s.code, /bool boton1 = digitalRead\(BOTON_1_SIG\) == LOW;/);
  assert.match(s.code, /bool disparo = boton1;/);
  assert.match(s.code, /digitalWrite\(LED_1_SIG, disparo \? HIGH : LOW\)/);
  assert.doesNotMatch(s.code, /digitalWrite\(13,/);
});

test("without any sensor the LED blinks by itself, like the simulation", () => {
  const s = sketchFor(benchMany("arduino-uno", "led", "buzzer", "relay"));
  assert.match(s.code, /digitalWrite\(LED_1_SIG, \(\(millis\(\) % 1000\) < 500\) \? HIGH : LOW\)/);
  assert.match(s.code, /digitalWrite\(ZUMBADOR_1_SIG, \(\(millis\(\) % 1000\) < 150\) \? HIGH : LOW\)/);
  assert.match(s.code, /digitalWrite\(RELE_1_IN, \(\(millis\(\) % 2000\) < 1000\) \? HIGH : LOW\)/);
  assert.doesNotMatch(s.code, /disparo/);
});

test("a PIR is a trigger too, and the servo sweeps by itself without a distance sensor", () => {
  const s = sketchFor(benchMany("arduino-uno", "pir", "led", "servo-sg90"));
  assert.match(s.code, /bool movimiento1 = digitalRead\(MOVIMIENTO_1_OUT\) == HIGH;/);
  assert.match(s.code, /bool disparo = movimiento1;/);
  assert.match(s.code, /millis\(\) % 4000/);
});

test("the potentiometer, soil and light sensors read analog pins and report", () => {
  const s = sketchFor(benchMany("arduino-uno", "potentiometer", "soil", "ldr", "l298n"));
  assert.match(s.code, /int pot1 = \(int\)\(analogRead\(POT_1_OUT\)/);
  assert.match(s.code, /int suelo1 = 100 - /);
  assert.match(s.code, /int luz1 = /);
  assert.match(s.code, /analogWrite\(MOTOR_1_ENA, map\(pot1, 0, 100, 0, 255\)\)/, "the motor follows the knob");
  assert.match(s.code, /Serial\.println\(pot1\)/);
  assert.match(s.code, /millis\(\) - ultimoInforme >= 500/, "the serial report is throttled");
});

test("several parts of one kind each get their own names", () => {
  const s = sketchFor(benchMany("arduino-uno", "led", "led", "led"));
  for (const n of [1, 2, 3]) {
    assert.match(s.code, new RegExp(`const int LED_${n}_SIG = \\d+;`));
    assert.match(s.code, new RegExp(`digitalWrite\\(LED_${n}_SIG,`));
  }
  const pins = [...s.code.matchAll(/const int LED_\d_SIG = (\d+);/g)].map((m) => m[1]);
  assert.equal(new Set(pins).size, 3, "three different pins");
  const two = sketchFor(benchMany("arduino-uno", "hc-sr04", "hc-sr04", "led"));
  assert.match(two.code, /float distancia1 = /);
  assert.match(two.code, /float distancia2 = /);
  assert.match(two.code, /bool disparo = \(distancia1 > 0 && distancia1 < 20\) \|\| \(distancia2 > 0 && distancia2 < 20\);/);
  assert.equal(two.code.match(/float leerDistancia/g)?.length, 1, "one helper");
  assert.match(two.code, /Serial\.print\("Distancia 2: "\)/);
});

test("a part that is not wired is a comment, not code", () => {
  let d = addPart(addPart(emptyDesign(), "arduino-uno").design, "led", { x: 8 }).design;
  d = autoWire(d, "led-1").design;
  d = addPart(d, "buzzer", { x: 16 }).design;
  const s = sketchFor(d);
  assert.match(s.code, /\/\/ buzzer-1: falta conectarla/);
  assert.doesNotMatch(s.code, /ZUMBADOR/);
  assert.deepEqual(s.skipped, [{ part: "buzzer-1", why: "unwired" }]);
  assert.match(s.code, /LED_1_SIG/);
});

test("a part the checker found faulty is left out, never a pin it flagged", () => {
  // a servo signal on a pin without PWM: the checker flags wrongPin
  const bad = sketchFor(hand("arduino-uno", "servo-sg90", { VCC: "5V", SIG: "D2", GND: "GND" }));
  assert.deepEqual(bad.skipped, [{ part: "servo-sg90-1", why: "check" }]);
  assert.doesNotMatch(bad.code, /attach/);
  assert.doesNotMatch(bad.code, /SERVO/);
  assert.match(bad.code, /servo-sg90-1: revisa su cableado/);
  assert.deepEqual(bad.libraries, []);
  // the same servo on a PWM pin is written
  const good = sketchFor(hand("arduino-uno", "servo-sg90", { VCC: "5V", SIG: "D9", GND: "GND" }));
  assert.deepEqual(good.skipped, []);
  assert.match(good.code, /const int SERVO_1_SIG = 9;/);
  // a shorted part is left out too
  const short = sketchFor(hand("arduino-uno", "buzzer", { SIG: "D2", GND: "5V" }));
  assert.deepEqual(short.skipped, [{ part: "buzzer-1", why: "check" }]);
  assert.doesNotMatch(short.code, /digitalWrite/);
});

test("a soft warning keeps the part but says so at the top", () => {
  const s = sketchFor(benchMany("esp32-devkit", "hc-sr04"));
  assert.deepEqual(s.skipped, []);
  assert.match(s.code, /hc-sr04-1: .*\(¡tiene avisos en la Revisión del circuito!\)/);
});

test("parts wired to another board are not mixed into this sketch", () => {
  let d = addPart(addPart(emptyDesign(), "arduino-uno").design, "esp32-devkit", { x: 12 }).design;
  const led = addPart(d, "led", { x: 8 });
  d = autoWire(led.design, led.id!, "esp32-devkit-1").design;
  const buzzer = addPart(d, "buzzer", { x: -8 });
  d = autoWire(buzzer.design, buzzer.id!, "arduino-uno-1").design;
  const s = sketchFor(d);
  assert.equal(s.board?.id, "arduino-uno-1", "the first board that has wired parts");
  assert.deepEqual(s.skipped, [{ part: "led-1", why: "otherBoard" }]);
  assert.match(s.code, /ZUMBADOR_1_SIG/);
  assert.doesNotMatch(s.code, /LED_1_SIG/);
  // when only the second board has parts, that one is the target
  let e = addPart(addPart(emptyDesign(), "arduino-uno").design, "esp32-devkit", { x: 12 }).design;
  const only = addPart(e, "led", { x: 8 });
  e = autoWire(only.design, only.id!, "esp32-devkit-1").design;
  assert.equal(sketchFor(e).board?.id, "esp32-devkit-1");
  assert.match(sketchFor(e).code, /LED_1_SIG/);
});

test("a display shows the distance, else the climate, else a greeting", () => {
  const dist = sketchFor(benchMany("arduino-uno", "hc-sr04", "lcd-1602-i2c"));
  assert.match(dist.code, /lcd1\.print\("Dist: "\); lcd1\.print\(distancia1, 0\);/);
  const clim = sketchFor(benchMany("arduino-uno", "dht22", "oled-128x64"));
  assert.match(clim.code, /if \(!isnan\(temperatura1\)\)/, "a failed DHT read does not print nan");
  assert.match(clim.code, /oled1\.print\(temperatura1, 1\)/);
  const hi = sketchFor(benchMany("arduino-uno", "oled-128x64"));
  assert.match(hi.code, /oled1\.print\("Hola!"\)/);
  assert.match(hi.code, /oled1\.print\(millis\(\) \/ 1000\)/);
});

test("the motor drives forward and its speed follows the distance when there is no knob", () => {
  const s = sketchFor(benchMany("arduino-uno", "hc-sr04", "l298n"));
  assert.match(s.code, /digitalWrite\(MOTOR_1_IN1, HIGH\);/);
  assert.match(s.code, /digitalWrite\(MOTOR_1_IN2, LOW\);/);
  assert.match(s.code, /velocidad1 = 255 - map\(constrain\(\(int\)distancia1, 5, 60\), 5, 60, 0, 255\)/);
  assert.match(s.code, /analogWrite\(MOTOR_1_ENA, velocidad1\)/);
  const alone = sketchFor(benchMany("arduino-uno", "l298n"));
  assert.match(alone.code, /analogWrite\(MOTOR_1_ENA, 153\)/);
});

test("every board with every part: balanced code, no placeholders, every constant used and declared once", () => {
  const types = COMPONENTS.filter((c) => c.kind === "part").map((c) => c.id);
  for (const board of ["arduino-uno", "arduino-nano", "esp32-devkit", "pico"]) {
    for (const group of [types, types.slice(0, 5), types.slice(5, 10), types.slice(10)]) {
      const s = sketchFor(benchMany(board, ...group));
      assert.equal(s.ok, true, board);
      balanced(s.code);
      assert.doesNotMatch(s.code, /undefined|NaN|\?\?|\[object|= ?;|= 0;  \/\/ ?\?/, board);
      const consts = [...s.code.matchAll(/^const int (\w+) = /gm)].map((m) => m[1]);
      assert.equal(new Set(consts).size, consts.length, `${board}: no repeated constants`);
      for (const name of consts) assert.ok((s.code.match(new RegExp(`\\b${name}\\b`, "g"))?.length ?? 0) >= 2, `${board}: ${name} is used`);
      assert.equal(s.code.match(/^void setup\(\)/gm)?.length, 1);
      assert.equal(s.code.match(/^void loop\(\)/gm)?.length, 1);
      for (const h of s.includes) assert.match(s.code, new RegExp(`#include <${h.replace(".", "\\.")}>`));
    }
  }
});

test("sketchFor is deterministic", () => {
  const d = benchMany("arduino-uno", "hc-sr04", "servo-sg90", "led", "oled-128x64");
  assert.deepEqual(sketchFor(d), sketchFor(JSON.parse(JSON.stringify(d)) as Design));
});
