# Arduino electronics reference

Be conservative: when a number is uncertain it is marked **(unverified)** or **(approx)**. Verify against the datasheet before putting a number in code, copy or a checker rule. Sources that were checked while writing this: Arduino docs (Uno Rev3 spec table: 3.3 V pin 50 mA, 20 mA recommended per I/O pin, 40 mA absolute max), ESP-IDF GPIO docs (input-only GPIO34-39, strapping pins, flash pins 6-11), secondary sources for the Pico (see the board section). Everything else is standard datasheet knowledge (ATmega328P, ESP32, RP2040, HC-SR04, SG90, L298N); re-check before safety-relevant use.

Quick rule for this repo: `checkDesign` knows pin kinds, supply voltage, 5 V vs 3.3 V logic and the 5 V budget. It does **not** know per-pin current, series resistors, diodes, motor supplies or I2C addresses. Green means "no known wiring mistake of the kinds we check", never "perfect".

## 1. Boards in the catalog

Catalog ids: `arduino-uno`, `arduino-nano`, `esp32-devkit`, `pico`. The catalog lists only the pins the lab offers (it leaves out the ones to avoid, see "Pins to avoid").

| | Uno R3 | Nano (classic) | ESP32 DevKit (WROOM-32) | Raspberry Pi Pico (RP2040) |
|---|---|---|---|---|
| MCU | ATmega328P, 16 MHz | ATmega328P, 16 MHz | ESP32, dual core 240 MHz, WiFi + BT | RP2040, dual core 133 MHz (no WiFi on the plain Pico) |
| Logic level | 5 V | 5 V | **3.3 V, pins NOT 5 V tolerant** | **3.3 V, pins NOT 5 V tolerant** |
| 5 V pin | `5V` (regulated, or USB 5 V) | `5V` | `5V` = VIN/USB 5 V (only when powered by USB or fed 5 V) | `VBUS` = USB 5 V (only when on USB); input power goes to `VSYS` (1.8-5.5 V) |
| 3.3 V pin | `3V3`: **50 mA max** | `3V3`: 50 mA on genuine boards (FT232 supplies it); clones **(unverified)** | `3V3` from the board's regulator (AMS1117-class): leave about 200-300 mA for your parts, WiFi bursts use a lot **(approx)** | `3V3(OUT)`: up to 300 mA, shared with the chip **(unverified, from a secondary source)** |
| Per I/O pin | 20 mA recommended, **40 mA absolute max** | same | default drive is the "medium" level (about 20 mA); absolute max 40 mA **(approx)**; plan for 10 mA or less | default 4 mA, programmable 2/4/8/12 mA; treat 12 mA as the ceiling **(secondary source)**; plan for 4 mA |
| All pins together | about 200 mA through VCC/GND pins, and about 100-150 mA per port group in the ATmega328P datasheet **(approx)**; plan for under 100 mA total | same | no figure we trust: keep it low | no figure we trust: keep it low |
| PWM | D3, D5, D6, D9, D10, D11 (about 490 Hz; D5 and D6 about 980 Hz) | same | any output-capable GPIO (LEDC, 16 channels) | any GPIO (8 slices, 16 channels) |
| ADC | A0-A5, 10 bit (0-1023), 0-5 V (AREF changeable) | A0-A7, 10 bit; **A6 and A7 are analog-input only** | 12 bit (0-4095), nonlinear at the ends, use 11 dB attenuation for about 0-3.3 V | GP26-28 (ADC0-2), 12 bit native; the Arduino core defaults to 10 bit, use `analogReadResolution(12)` **(approx)** |
| I2C | SDA = A4, SCL = A5 | SDA = A4, SCL = A5 | default SDA = GPIO21, SCL = GPIO22 (any pins by remapping) | I2C0 default (arduino-pico `Wire`): SDA = GP4, SCL = GP5 **(approx)** |
| SPI | D10 SS, D11 MOSI, D12 MISO, D13 SCK | same | VSPI default: GPIO5 CS, 23 MOSI, 19 MISO, 18 SCK | arduino-pico default SPI0: GP16 MISO, GP17 CS, GP18 SCK, GP19 MOSI **(approx)** |
| Hardware interrupts | D2 (INT0), D3 (INT1); pin-change on others | same | any GPIO | any GPIO |
| Serial to PC | D0 (RX), D1 (TX), shared with USB | same | GPIO3 (RX0), GPIO1 (TX0) via USB bridge | USB CDC; UART0 is GP0/GP1 |
| Power in | USB 5 V, barrel/VIN 7-12 V recommended (6-20 V limits) | USB, VIN 7-12 V | USB 5 V, or 5 V on `5V`/VIN | USB, or 1.8-5.5 V on VSYS |
| USB | USB-B | mini-B (clones often micro-USB) | micro-USB or USB-C depending on the board | micro-USB |

Details and warnings:

- **USB power budget: about 500 mA** for a standard USB 2.0 port (100 mA until the device enumerates). The catalog gives each board `budgetMa` = 500 (Pico 300) as the checker's limit for what hangs on the 5 V pin. The board itself uses roughly 50 mA (Uno) to 80-240 mA (ESP32 with WiFi) of that. Real headroom for parts is therefore less than 500. Stay under about 300 mA for parts on USB.
- **Barrel jack / VIN on Uno and Nano:** the onboard linear regulator turns the extra voltage into heat (watts = (Vin - 5 V) x current). At 12 V and 300 mA that is 2 W and the regulator throttles or gets very hot. Recommend 7-9 V, and keep 5 V loads under about 400 mA **(approx)**.
- **4xAA battery pack** (catalog `battery-aa4`, `supplies: 6`): fresh alkaline cells are 6.0-6.4 V, NiMH 4.8 V. On Uno/Nano `VIN` that is below the 7 V recommended minimum, so the 5 V rail may sag under load. It is fine for servos and motors (see below) but not great as the only supply for the board. The ESP32 and Pico in the catalog expose no VIN/VSYS pin, so the checker only lets the pack join `vin` pins on Uno/Nano.
- **3.3 V from a 5 V board:** Uno 3V3 pin gives 50 mA, enough for an OLED or DHT22, not for an ESP32 or a radio.
- Never power an ESP32 or Pico pin from 5 V logic, and never feed 5 V to the `3V3` pin. The checker's `mixedPower` (5 V + 3.3 V joined) and `overvoltage` (3.3 V part on 5 V) catch the power cases.
- ESP32 power glitches: WiFi transmit bursts can pull a few hundred mA for microseconds. A 100-470 uF capacitor near the board's power input avoids random reboots (brownout).

### Pins to avoid

- **Uno / Nano:** D0 and D1 (serial, used by USB upload; wiring a part there breaks uploads and Serial). The catalog starts at D2 for this reason. D13 has the onboard LED (an input there fights the LED, usable as output). A4/A5 are the I2C bus: do not use them for signals if you have an I2C part. Nano A6/A7 cannot do digital I/O. On Uno, the `Servo` library disables PWM on D9 and D10, and `tone()` disables PWM on D3 and D11 **(approx)**.
- **ESP32:**
  - GPIO34, 35, 36 (VP), 39 (VN): **input only**, no internal pull-up or pull-down. The catalog marks them `analog` only, so the checker will not put an output or a button there. A button needs an external pull-up to use them.
  - GPIO6-11: connected to the flash chip. Never use. (Not in the catalog.)
  - Strapping pins: GPIO0, GPIO2, GPIO5, GPIO12 (MTDI), GPIO15 (MTDO). They set boot mode at reset. GPIO12 high at boot can select the wrong flash voltage and the board will not boot; GPIO0 low at boot enters download mode; GPIO2 should be low or floating to flash; GPIO15 low silences the boot log. The catalog still lists 2, 5, 12 and 15: prefer 4, 13, 14, 16, 17, 18, 19, 23, 25, 26, 27, 32, 33 and keep boot-sensitive pins for LEDs or nothing. A relay or a sensor that pulls GPIO12 high at power-up can stop the board from booting.
  - ADC2 pins (GPIO2, 4, 12, 13, 14, 15, 25, 26, 27) **cannot read analog while WiFi is on**. For analog sensors with WiFi use ADC1: GPIO32-39 (the catalog marks both groups `analog`; prefer 32, 33, 34, 35, 36, 39 for analog).
  - GPIO1 and GPIO3 are the USB serial; GPIO16/17 are used for PSRAM on WROVER modules (fine on plain WROOM).
- **Pico:** GP23, GP24, GP25 are used internally (power mode, USB sense, onboard LED) and are not in the catalog. GP0/GP1 are the default UART, left out for the same reason as Uno D0/D1. `GP29` reads VSYS/3.
- Power a part from a pin only if it draws a few mA. Anything more (buzzer, relay coil, motor, LED strip, servo) goes to a supply rail or through a transistor/driver.

## 2. Core electronics

### Logic levels and level shifting

- A 5 V signal into a 3.3 V board (ESP32, Pico) can damage it. The checker flags this as `level` when a part with `out5v: true` (today: HC-SR04) reaches a 3.3 V board.
- **HC-SR04 ECHO into a 3.3 V board:** voltage divider. ECHO -> 1 k ohm -> node -> 2 k ohm -> GND; the node goes to the GPIO. Output = 5 V x 2k / (1k + 2k) = 3.33 V. Any ratio of about 1:2 works (2.2 k / 3.3 k gives 3.0 V). Keep resistors under about 10 k so the edge is fast enough. TRIG (3.3 V -> sensor) is usually accepted by the HC-SR04 without shifting. A 3.3 V-native sensor (HC-SR04P, RCWL-1601 **(unverified models)**) needs no divider.
- Other 5 V -> 3.3 V paths: a logic-level shifter module (4-channel BSS138) for bidirectional lines such as I2C; a 74HCT/74LVC buffer for one-way outputs.
- 3.3 V -> 5 V (a 3.3 V ESP32 output driving a 5 V input): most 5 V inputs read 3.3 V as HIGH (TTL-compatible threshold about 2 V), but not all. Relay modules and some LCD backpacks may not trigger reliably **(unverified per module)**.
- **I2C pull-ups go to the module's supply.** An LCD 1602 backpack powered from 5 V usually pulls SDA/SCL up to 5 V, which is unsafe for ESP32 and Pico pins **(typical, check the board)**. Use a level shifter, or power the I2C line pull-ups from 3.3 V (remove the 5 V pull-up resistors from the backpack), or use the OLED instead. The checker does **not** catch this today: a gap worth closing (a `level` issue for I2C parts that need 5 V on a 3.3 V board).

### Pull-ups and buttons

- Wire a button between a digital pin and GND and use `pinMode(pin, INPUT_PULLUP)`. The internal pull-up is about 20-50 kohm on ATmega328P. Pressed reads LOW (invert in code). This matches the catalog `button` (`SIG` + `GND`, no VCC).
- ESP32 GPIO34-39 have no internal pull-ups: add a 10 k resistor to 3.3 V.
- Mechanical buttons bounce for 5-20 ms: debounce in code (ignore changes for 20-50 ms).
- Never leave an input floating (random readings).
- **I2C pull-ups:** SDA and SCL need pull-ups to the supply, typically 4.7 kohm (2.2-10 k works at 100-400 kHz). Most OLED, LCD-backpack and sensor breakouts already have them. Several modules in parallel lower the combined resistance (two 4.7 k = 2.35 k; below about 1 k is too strong for the pins). One bus, many devices, each with a **different address**. The checker allows a shared I2C bus (`pinShared` is not raised) but does not compare addresses.
- Typical addresses: SSD1306 OLED 0x3C (sometimes 0x3D); PCF8574 LCD backpack 0x27 (PCF8574A: 0x3F). Two identical modules clash unless one has an address jumper.

### Resistors for LEDs

`R = (Vsupply - Vf) / I`. Pick the next standard value up (E12) and check the current again. `Vf` (forward voltage) is about 1.8-2.2 V for red/yellow/green, 2.8-3.4 V for blue and white **(typical)**.

| Case | Calculation | Choice | Result |
|---|---|---|---|
| Red LED, Uno 5 V, aim 10 mA | (5 - 2.0) / 0.010 = 300 ohm | 330 ohm | about 9 mA |
| Red LED, Uno 5 V, aim 15 mA, bright | (5 - 2.0) / 0.015 = 200 ohm | 220 ohm | about 13.6 mA |
| Red LED, ESP32 3.3 V, aim 5 mA | (3.3 - 2.0) / 0.005 = 260 ohm | 270 ohm | about 4.8 mA |
| Red LED, Pico 3.3 V (default 4 mA pin) | (3.3 - 2.0) / 0.004 = 325 ohm | 330 ohm | about 3.9 mA |
| Blue/white LED on 3.3 V | (3.3 - 3.1) / 0.005 = 40 ohm: almost no headroom | use a 5 V board or a transistor | may be dim or flicker |

- Resistor goes in series with the LED, either side. Long leg (anode) toward the pin/resistor, short leg (cathode, flat side) to GND.
- Without it the LED or the pin burns out (a 5 V pin tries to push far more than 20 mA).
- **The catalog `led` has no resistor part.** Treat the catalog LED as "LED with its resistor" in copy, and tell the person to add 220-330 ohm in real life. A resistor row could be added to the catalog later.
- Never exceed 20 mA per pin on an Uno; the LED's catalog `mA: 20` is the worst case, and a resistor keeps it near 10.

### Relays, motors and inductive loads

- A coil (relay, motor, solenoid, buzzer coil) stores energy; when current stops it kicks a voltage spike back. Put a **flyback diode** (1N4007 or 1N4148) across the coil, **cathode (striped end) to the positive side**. Relay modules (blue SRD-05VDC boards) already have the diode and a transistor/optocoupler. A bare relay, motor or solenoid needs one. A brushed DC motor also benefits from a 100 nF ceramic capacitor across its terminals.
- **Common ground:** when a part runs from a separate supply (battery for motors, a pump, a servo), join that supply's GND to the board's GND. Without it the control signal has no reference and the part behaves randomly. Only GND is joined; never join the two + rails.
- **Why separate supplies:** motors and servos pull large, spiky currents that drop the voltage on the board's 5 V and reset it, and they can exceed what USB (500 mA) or the regulator can give. Power the board and the logic from USB/its own supply; power motors/servos from a battery pack; share GND.
- Relay module: `IN` is driven by a pin with only a few mA (optocoupler LED). Many modules are **active LOW** (LOW = relay on) and have a `JD-VCC` jumper to split coil power from logic power. The coil draws about 70 mA at 5 V (catalog `mA: 70`), the pin does not. Relay contacts (COM, NO, NC) are not modeled by the catalog.
- **Mains voltage (110/220 V) is out of scope** for this lab and its agent: do not generate mains wiring, do not put mains in a PLA enclosure. Tell the person to ask a qualified electrician.

### Servos (SG90)

- Signal 3-5 V logic, PWM at 50 Hz, pulse about 1000-2000 us (0-180 degrees; about 500-2400 us on many clones). Supply 4.8-6 V (catalog `[4.8, 6]`); the catalog assumes `mA: 250` worst case in motion.
- **Stall current of an SG90 is about 550-650 mA (unverified, one secondary source says 550 mA); idle is about 10 mA (approx), moving 100-250 mA (approx).** A stalled servo (blocked arm) can reset a USB-powered Uno.
- Power: for one unloaded servo the Uno 5 V pin can work on a good USB port. With two or more, or a load, use a separate 5 V (4.8 V NiMH x4 is ideal; 4 alkaline cells can reach 6.4 V, slightly above the SG90's 6 V rating) and share GND. Add a 470-1000 uF capacitor across the servo supply.
- Servo signal needs a PWM-capable pin in the catalog (`accepts: ["pwm"]`). Uno: use D9 or D10 with `Servo.h` (the library takes Timer1). ESP32: `ESP32Servo` library. Pico: the `Servo` library of arduino-pico.
- Sketch: `#include <Servo.h>`, `Servo s; s.attach(9); s.write(90);`

### Motor drivers (L298N module)

- Catalog `l298n` exposes `5V` (logic), `ENA`, `IN1`, `IN2`, `GND` (one motor channel). The motor supply terminal, the motor outputs and the second channel (ENB, IN3, IN4) are not modeled yet.
- Truth table (per channel, ENA high): IN1 = HIGH, IN2 = LOW forward; IN1 = LOW, IN2 = HIGH reverse; both equal = stop (brake). ENA low = motor off (coast). `analogWrite(ENA, 0-255)` sets speed. On the module `ENA` has a jumper cap: keep it for full speed, remove it to use PWM from the board.
- **Voltage drop:** the L298N's bipolar outputs lose about 1.8-3 V in total at 1 A **(approx)**. A 6 V motor on a 6 V supply gets about 3-4 V and runs slow. Use a supply 2-3 V above the motor's rated voltage.
- Supply: motor supply 5-35 V (module); the onboard 5 V regulator (jumper `5V-EN`) is for supplies up to about 12 V; above that remove the jumper and feed the logic `5V` pin yourself. With the jumper on, the 5 V terminal is an output, with it off an input.
- Current: 2 A per channel is the chip's DC rating; without a heatsink expect to run well under that (about 1 A) **(approx)**. The module runs hot: leave space in the enclosure for airflow.
- Common ground: motor supply GND, L298N GND and board GND all joined.
- Not logic-level sensitive on 3.3 V boards (input high threshold about 2.3 V), so ESP32/Pico can drive IN1/IN2. **(approx)**

### Decoupling and noise

- 100 nF ceramic capacitor right at the VCC/GND of ICs and sensors (many modules include them).
- 10-100 uF electrolytic near servos, motors, relays and where long wires bring power. 100-470 uF at the ESP32 power input.
- Keep wires short; twist signal with ground for ultrasonic and analog signals; keep motor wires away from sensor wires.

## 3. Wiring recipes for every catalog component

Format: pins (as in the catalog) -> board; voltage; library; minimal code. "Board 5 V" means the board's `5V`/`VBUS` pin. On a 3.3 V board use `3V3` where the part allows it (`autoWire` already does this). Pin numbers in the code are examples: use the pins the design actually has (`boardPinsOf`).

### Boards (`arduino-uno`, `arduino-nano`, `esp32-devkit`, `pico`)
Power from USB. IDE board settings: Uno "Arduino Uno"; Nano "Arduino Nano" (clones with CH340 often need Processor "ATmega328P (Old Bootloader)"); ESP32 "ESP32 Dev Module" (Espressif core); Pico "Raspberry Pi Pico" (arduino-pico core by Earle Philhower **(verify)**).

### `hc-sr04` (ultrasonic distance)
- VCC -> 5 V, GND -> GND, TRIG -> digital, ECHO -> digital (**divider 1k/2k on 3.3 V boards**). 4.5-5.5 V, about 15 mA. Range 2-400 cm **(spec)**, practical 3-300 cm; beam about 15 degrees; soft or angled surfaces read badly.
- No library needed. Distance in cm = echo microseconds / 58.
```cpp
const int TRIG = 9, ECHO = 10;
long readCm() {
  digitalWrite(TRIG, LOW); delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);   // 30 ms timeout = about 5 m
  return us ? us / 58 : -1;               // -1 = nothing seen
}
void setup() { pinMode(TRIG, OUTPUT); pinMode(ECHO, INPUT); Serial.begin(9600); }
void loop() { Serial.println(readCm()); delay(100); }
```
- Measure at least 60 ms apart (echo from the previous ping).

### `pir` (motion, HC-SR501 type)
- VCC -> 5 V (module accepts about 5-20 V **(approx; catalog says 4.5-12)**), OUT -> digital, GND -> GND. OUT is 3.3 V HIGH, so it is safe on 3.3 V boards.
- Needs 30-60 s to warm up after power-on (ignore early readings). Two pots set sensitivity and hold time; a jumper picks retrigger mode.
```cpp
const int PIR = 2;
void setup() { pinMode(PIR, INPUT); Serial.begin(9600); delay(30000); }
void loop() { if (digitalRead(PIR) == HIGH) Serial.println("Movimiento"); delay(200); }
```

### `dht22` (temperature and humidity, AM2302)
- VCC -> 3.3 V or 5 V (3.3-6 V), DATA -> digital, GND -> GND. Bare 4-pin parts need a 10 k pull-up between DATA and VCC; 3-pin modules have it.
- Library: "DHT sensor library" by Adafruit (+ "Adafruit Unified Sensor"). Read at most every 2 s. Typical accuracy about 0.5 C and 2-5 %RH.
```cpp
#include <DHT.h>
DHT dht(4, DHT22);
void setup() { Serial.begin(9600); dht.begin(); }
void loop() { float t = dht.readTemperature(), h = dht.readHumidity();
  if (!isnan(t)) { Serial.print(t); Serial.print(" C  "); Serial.println(h); } delay(2000); }
```

### `soil` (soil moisture)
- VCC -> 3.3 V or 5 V, AOUT -> **analog** pin, GND -> GND. On ESP32 use ADC1 pins (32-39) if WiFi is used.
- Capacitive probes last; resistive ones corrode in weeks (power them only while reading, or prefer capacitive). The raw value is usually **higher when drier**: calibrate dry (air) and wet (in water) and map to 0-100 %. Wet/dry numbers differ per probe.
```cpp
int pct() { int raw = analogRead(A0); return constrain(map(raw, 620, 300, 0, 100), 0, 100); } // calibrate 620 and 300
```

### `ldr` (light sensor module)
- VCC -> 3.3 V or 5 V, AOUT -> analog, GND -> GND. For a bare LDR build a divider: 5 V -> LDR -> node -> 10 k -> GND, node to the analog pin.
- Raw value goes up or down with light depending on the module: calibrate. Use a threshold with a gap (hysteresis) to avoid flicker.
```cpp
void loop() { int light = analogRead(A0); digitalWrite(LED_BUILTIN, light < 300); delay(50); }
```

### `servo-sg90`
- Red -> 5 V (separate pack if loaded), brown/black -> GND (common GND), orange/yellow -> **PWM** pin. See servo section.
```cpp
#include <Servo.h>
Servo s;
void setup() { s.attach(9); }
void loop() { s.write(0); delay(800); s.write(180); delay(800); }
```

### `relay` (1-channel module)
- VCC -> 5 V, IN -> digital, GND -> GND. Coil about 70 mA. Often active LOW. Load wires go to COM and NO (normally open); the load's own supply stays separate. Low-voltage loads only in this lab.
```cpp
const int RELAY = 7;
void setup() { pinMode(RELAY, OUTPUT); digitalWrite(RELAY, HIGH); }  // HIGH = off on active-LOW modules
void loop() { digitalWrite(RELAY, LOW); delay(2000); digitalWrite(RELAY, HIGH); delay(2000); }
```
- A bare relay must not be driven from a pin: use a transistor (2N2222 or BC547, 1 k base resistor) and a flyback diode.

### `buzzer`
- SIG -> digital or PWM pin, GND -> GND. **Active** buzzer: beeps with a plain HIGH. **Passive** buzzer: needs `tone(pin, hz)`. Catalog `mA: 30` is above the Uno's 20 mA recommended pin current: for a 30 mA part either use a small active buzzer that draws under about 15 mA, or drive it from a transistor (NPN with a 1 k base resistor, buzzer between 5 V and collector). `tone()` is not available the same way on every core (ESP32 uses `ledcWriteTone` in older cores) **(verify per core version)**.
```cpp
void loop() { tone(8, 1000, 200); delay(500); }   // passive buzzer on D8
```

### `led`
- SIG -> digital or PWM pin through a **220-330 ohm resistor** (see table), GND -> GND. PWM pin for dimming (`analogWrite`).
```cpp
void setup() { pinMode(5, OUTPUT); }
void loop() { digitalWrite(5, HIGH); delay(500); digitalWrite(5, LOW); delay(500); }
```

### `l298n` (one motor channel)
- 5V -> board 5 V (logic), ENA -> **PWM** pin, IN1 and IN2 -> digital pins, GND -> GND (common with the motor supply). Motor supply from the battery pack to the module's 12V/VS terminal; motor to OUT1/OUT2 (not modeled).
```cpp
const int ENA = 5, IN1 = 7, IN2 = 8;
void setup() { pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); }
void loop() { digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW); analogWrite(ENA, 180); delay(2000);
              digitalWrite(IN1, LOW);  digitalWrite(IN2, HIGH); delay(2000); }
```

### `oled-128x64` (SSD1306, I2C)
- VCC -> 3.3 V or 5 V (3.3-5 V), GND, SDA -> SDA pin, SCL -> SCL pin. Address 0x3C. Draws about 20 mA with many pixels on.
- Libraries: "Adafruit SSD1306" + "Adafruit GFX" (or "U8g2").
```cpp
#include <Wire.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 oled(128, 64, &Wire, -1);
void setup() { oled.begin(SSD1306_SWITCHCAPVCC, 0x3C); oled.setTextSize(2); oled.setTextColor(SSD1306_WHITE);
  oled.clearDisplay(); oled.setCursor(0, 0); oled.println("Hola"); oled.display(); }
void loop() {}
```

### `lcd-1602-i2c` (16x2 with PCF8574 backpack)
- VCC -> **5 V** (4.5-5.5 V; backlight needs it), GND, SDA, SCL. Address 0x27 (or 0x3F). Contrast pot on the back of the backpack (nothing visible when it is wrong: turn it). On ESP32/Pico read the I2C pull-up warning above.
- Library: "LiquidCrystal I2C" (Frank de Brabander, or the maintained fork) **(verify the library name in Library Manager)**.
```cpp
#include <LiquidCrystal_I2C.h>
LiquidCrystal_I2C lcd(0x27, 16, 2);
void setup() { lcd.init(); lcd.backlight(); lcd.print("Hola"); }
void loop() {}
```

### `button`
- SIG -> digital pin, GND -> GND. `INPUT_PULLUP`; pressed = LOW. Debounce.
```cpp
void setup() { pinMode(2, INPUT_PULLUP); Serial.begin(9600); }
void loop() { if (digitalRead(2) == LOW) { Serial.println("Presionado"); delay(200); } }
```

### `potentiometer` (10 k)
- VCC -> 3.3 V or 5 V, OUT (wiper) -> **analog** pin, GND -> GND. Reading 0-1023 on Uno, 0-4095 on ESP32/Pico (12 bit).
```cpp
void loop() { int v = analogRead(A0); int pwm = map(v, 0, 1023, 0, 255); analogWrite(5, pwm); delay(10); }
```

### `battery-aa4` (4xAA pack)
- `+` -> `VIN` (Uno/Nano only in the checker), `-` -> GND. 6 V fresh alkaline (about 6.4 V peak), 4.8 V NiMH. Under 7 V is below the Uno's recommended VIN range: it works for light loads but may sag. Do **not** feed 6 V to a `5V` or `3V3` pin. Better use: power servos and motors from it with GND joined to the board. Alkaline cells have high internal resistance (voltage sags under motor load); NiMH holds up better. Add an on/off switch in real builds.

## 4. What the checker says, in plain Spanish

How to explain each issue (one or two sentences, no jargon, say what to do). Match the keys in `IssueKey`. Real copy lives in `src/views/copy/lab.ts`; keep these as the model.

| Key | Level | What it means | Explain it like this |
|---|---|---|---|
| `short` | red | power and ground joined (short circuit) | "Esto une la corriente con la tierra y es un cortocircuito: se puede quemar algo. Quita ese cable y conecta la pieza a un pin de señal." |
| `mixedPower` | red | 5 V and 3,3 V joined | "Juntaste dos salidas de energía de distinto voltaje. Usa solo una de las dos para esta pieza." |
| `overvoltage` | red | a 3,3 V part on 5 V | "Esta pieza solo aguanta 3,3 voltios y la conectaste a 5. Se puede dañar: cámbiala al pin de 3,3 V." |
| `missing` | yellow | a required pin not wired | "A esta pieza le falta un cable (el pin que se ve marcado). Sin él no va a funcionar. Puedo conectarlo yo." |
| `wrongPin` | yellow | pin that cannot do that job | "Ese pin no sirve para eso. Por ejemplo, un sensor analógico necesita un pin de los que empiezan con A." |
| `undervoltage` | yellow | supply too low for the part | "Esta pieza necesita más energía de la que le llega; puede apagarse o fallar. Conéctala al pin de 5 V." |
| `pinShared` | yellow | one board signal pin for two parts | "Dos piezas quieren usar el mismo pin y se van a estorbar. Cambia una a otro pin libre." |
| `level` | yellow | 5 V signal into a 3,3 V board | "Este sensor devuelve 5 voltios y tu placa solo aguanta 3,3. Hay que bajarle el voltaje con dos resistencias (1 k y 2 k) antes de entrar." |
| `budget` | yellow | 5 V draw above what the board gives | "Entre todas las piezas piden más corriente de la que da la placa por USB. Usa una fuente aparte para las piezas que más gastan (motores, servos)." |
| `noBoard` | yellow | no board on the bench | "Falta la placa: es el cerebro. Agrega un Arduino, un ESP32 o una Pico." |

Not caught by the checker, so say it yourself when it applies (and recommend it, short and kind):
- LED without a resistor: "Ponle una resistencia de 220 a 330 ohmios para que no se queme."
- 3,3 V board with the LCD 1602: its cables carry 5 V: "Esta pantalla usa 5 voltios en sus cables de datos; con tu placa necesitas un adaptador de voltaje o usar la pantalla OLED."
- Servo or motor from the board's pin: "Los motores gastan mucho. Aliméntalos con las pilas y une la tierra (GND) de las pilas con la de la placa."
- Two I2C screens with the same address: "Las dos pantallas tienen la misma dirección y no pueden hablar a la vez."
- ESP32 pins 2, 5, 12, 15 or 34-39: "Ese pin es delicado en el ESP32; mejor usa el 13, 14, 25 o 26."

## 5. Project ideas by level (catalog parts only unless noted)

Wiring uses example pins on an Uno. On 3.3 V boards apply the level, pull-up and pin rules above. `autoWire` can create the wires; check pin choices against sketch pins.

**Level 1 (a few minutes)**
- *Parpadeo:* `led` on D5 (+ 220 ohm). Code: digital blink.
- *Luz de noche:* `ldr` AOUT -> A0, `led` -> D5. LED on when `analogRead(A0)` shows dark (calibrate).
- *Perilla y servo:* `potentiometer` OUT -> A0, `servo-sg90` SIG -> D9. `s.write(map(analogRead(A0), 0, 1023, 0, 180))`.
- *Botón y luz:* `button` -> D2 (`INPUT_PULLUP`), `led` -> D5, toggles on press.

**Level 2**
- *Sensor de estacionamiento:* `arduino-uno` + `hc-sr04` (TRIG D9, ECHO D10, 5 V) + `buzzer` (D6, through a transistor if over 20 mA) + `led` (D5). Beep faster as distance shrinks: `delay(distance * 10)`. Add `oled-128x64` (SDA A4, SCL A5) for centimeters. 5 V board: no divider; on ESP32 add the 1k/2k divider on ECHO.
- *Termómetro con pantalla:* `arduino-nano` (or ESP32) + `dht22` DATA D4 + `oled-128x64` I2C. Shows temperature and humidity every 2 s.
- *Alarma de movimiento:* `pir` OUT D2 + `buzzer` D8 + `led` D5 + `button` D3 to arm/disarm (`INPUT_PULLUP`). Ignore the first 30-60 s after power-on.
- *Regulador de luz (dimmer):* `potentiometer` A0 -> PWM on `led` D5 (`analogWrite`).

**Level 3**
- *Riego de plantas:* `arduino-uno` + `soil` AOUT A0 + `relay` IN D7 + `oled-128x64`. Small 5 V pump on its own supply wired through the relay's COM/NO (relay contacts are outside the checker), GND common, 100 nF across the pump, flyback is already on the relay module. Water for a few seconds when the reading is dry, then wait minutes (soil is slow): never loop-and-flood. Hysteresis thresholds. Do not water if the sensor reads out of range (unplugged).
- *Estación del clima:* `esp32-devkit` + `dht22` DATA GPIO4 + `ldr` AOUT GPIO34 (ADC1, input-only is fine for analog) + `oled-128x64` (SDA GPIO21, SCL GPIO22). 3.3 V everywhere; no level issues. Send values to WiFi only with the user's own network and keys (never in the code, see lessons).
- *Puerta inteligente:* `pir` D2 detects someone, `servo-sg90` D9 opens a latch (own supply, common GND), `button` D3 inside "open", `buzzer` D8 chime, `lcd-1602-i2c` (5 V board) says "Bienvenido".
- *Radar:* `hc-sr04` mounted on `servo-sg90` sweeping 0-180 degrees, `oled-128x64` plots distance by angle. Keep the servo supply separate.

**Level 4 (needs parts the catalog does not have yet)**
- *Seguidor de línea:* two IR reflectance sensors (TCRT5000 modules, **not in the catalog**), `l298n` with **two** motor channels (the catalog exposes one), two DC motors, a chassis, `battery-aa4`. Logic: read both sensors; steer by speeding the opposite wheel. Needs the L298N's ENB/IN3/IN4 and a motor part first; add them (see "How to add a component" in SKILL.md) before promising it. Until then, the agent should say it can build a one-motor demo.

Good rule for the agent: suggest a project only when every part exists in the catalog; say which part is missing otherwise.
