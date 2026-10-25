// The parts the Arduino lab knows (spec/005-arduino-lab.md): their pins, what they draw and whether the
// emulator runs them. Types follow Wokwi's diagram.json names (wokwi-*), so a project also opens on
// wokwi.com; parts Wokwi does not have use a qubbot-* type. Names and explanations live in
// renderer/i18n/es.js (strings.lab.parts[key]); here only keys and numbers.

const DIGITAL = Array.from({ length: 14 }, (_, i) => String(i));
const ANALOG = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const POWER = ['5V', '3.3V', 'VIN', 'GND.1', 'GND.2', 'GND.3', 'RESET', 'AREF', 'IOREF'];
const UNO_PWM = ['3', '5', '6', '9', '10', '11'];

// Board pin name -> the ATmega328P port and bit behind it (Uno and Nano)
export const ATMEGA328P_PINS = Object.fromEntries([
  ...DIGITAL.map((p, i) => [p, i < 8 ? { port: 'D', bit: i } : { port: 'B', bit: i - 8 }]),
  ...ANALOG.map((p, i) => [p, { port: 'C', bit: i, adc: i }]),
]);

const board = (key, fqbn, extra = {}) => ({
  key, kind: 'board', fqbn, mcu: 'atmega328p', emulated: true,
  pins: [...DIGITAL, ...ANALOG, ...POWER], digital: DIGITAL, analog: ANALOG, pwm: UNO_PWM,
  serial: { rx: '0', tx: '1' },
  pinMa: 20, // recommended per pin (40 is the absolute maximum)
  fiveVoltMa: 500, // what the 5V pin can give from USB, for everything together
  ...extra,
});

export const PARTS = {
  'wokwi-arduino-uno': board('uno', 'arduino:avr:uno'),
  'wokwi-arduino-nano': board('nano', 'arduino:avr:nano'),
  // The Mega's ATmega2560 is not emulated yet (phase 3): it can be drawn, validated and compiled
  'wokwi-arduino-mega': board('mega', 'arduino:avr:mega', { mcu: 'atmega2560', emulated: false, pwm: ['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '44', '45', '46'] }),
  'wokwi-breadboard-half': { key: 'breadboard', kind: 'breadboard', pins: [] },
  'wokwi-breadboard': { key: 'breadboard', kind: 'breadboard', pins: [] },
  'wokwi-led': { key: 'led', kind: 'led', pins: ['A', 'C'], ma: 20 },
  'wokwi-resistor': { key: 'resistor', kind: 'resistor', pins: ['1', '2'] },
  'wokwi-buzzer': { key: 'buzzer', kind: 'buzzer', pins: ['1', '2'], ma: 30 },
  'wokwi-hc-sr04': { key: 'ultrasonic', kind: 'ultrasonic', pins: ['VCC', 'TRIG', 'ECHO', 'GND'], ma: 15, rangeCm: [2, 400] },
  // attrs.model: 'sg90' (default) or 'mg996r'; ma = while moving under load
  'wokwi-servo': { key: 'servo', kind: 'servo', pins: ['GND', 'V+', 'PWM'], ma: { sg90: 250, mg996r: 1500 } },
  'wokwi-analog-joystick': { key: 'joystick', kind: 'joystick', pins: ['VCC', 'VERT', 'HORZ', 'SEL', 'GND'], ma: 1 },
  'qubbot-l298n': { key: 'l298n', kind: 'motorDriver', pins: ['IN1', 'IN2', 'IN3', 'IN4', 'ENA', 'ENB', '12V', '5V', 'GND', 'OUT1', 'OUT2', 'OUT3', 'OUT4'] },
  'qubbot-dc-motor': { key: 'motor', kind: 'motor', pins: ['1', '2'], ma: 400 },
  'qubbot-hc05': { key: 'hc05', kind: 'bluetooth', pins: ['VCC', 'GND', 'TXD', 'RXD', 'STATE', 'EN'], ma: 40 },
  // attrs.volts: 6 (4×AA), 7.4 (2×18650), 3.7 (LiPo)…
  'qubbot-battery': { key: 'battery', kind: 'supply', pins: ['+', '-'] },
};

export const partOf = (type) => PARTS[type] ?? null;

// What the emulator runs in phase 1 (the rest is drawn and validated)
export const EMULATED_KINDS = ['board', 'led', 'resistor', 'buzzer', 'ultrasonic', 'breadboard'];

// A plain list for the agent (platanus_arduino_parts): type, key, kind, pins and the numbers that matter
export function catalog() {
  return Object.entries(PARTS).map(([type, p]) => ({
    type, key: p.key, kind: p.kind, pins: p.pins,
    ...(p.kind === 'board' ? { fqbn: p.fqbn, mcu: p.mcu, emulated: p.emulated, pwm: p.pwm } : { emulated: EMULATED_KINDS.includes(p.kind) }),
    ...(p.ma ? { ma: p.ma } : {}),
    ...(p.rangeCm ? { rangeCm: p.rangeCm } : {}),
  }));
}

export const isGroundPin = (pin) => /^GND(\.\d+)?$/.test(pin);
