// How each part answers the emulated pins (spec/005-arduino-lab.md). Pure: levels and the CPU's cycle
// count in, numbers out; emulator.js wires them to avr8js. 16 MHz, as on the Uno and the Nano.
export const F_CPU = 16e6;
export const usToCycles = (us) => Math.round((us * F_CPU) / 1e6);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// HC-SR04: a TRIG pulse of at least 10 µs starts a measurement; ~0.45 ms later (the 8 pulses at 40 kHz)
// ECHO goes high for distance × 58 µs (the sound's round trip). Out of range (over 400 cm) it stays high
// ~38 ms, as the real module does. trig() returns the echo to schedule: { start, end } in cycles, or null.
export const ULTRASONIC = { minCm: 2, maxCm: 400, usPerCm: 58, burstUs: 450, timeoutUs: 38000, minTrigUs: 10 };

export class Ultrasonic {
  #cm;
  #trigHigh = false;
  #since = 0;
  #busyUntil = -1;

  constructor({ distanceCm = 100 } = {}) {
    this.#cm = distanceCm;
  }

  get distanceCm() {
    return this.#cm;
  }

  setDistance(cm) {
    this.#cm = clamp(Number(cm) || 0, ULTRASONIC.minCm, 1000);
  }

  // Echo length in µs for the current distance
  get echoUs() {
    return this.#cm > ULTRASONIC.maxCm ? ULTRASONIC.timeoutUs : this.#cm * ULTRASONIC.usPerCm;
  }

  trig(level, cycles) {
    if (level && !this.#trigHigh) {
      this.#trigHigh = true;
      this.#since = cycles;
      return null;
    }
    if (!level && this.#trigHigh) {
      this.#trigHigh = false;
      if (cycles - this.#since < usToCycles(ULTRASONIC.minTrigUs) || cycles < this.#busyUntil) return null;
      const start = cycles + usToCycles(ULTRASONIC.burstUs);
      const end = start + usToCycles(this.echoUs);
      this.#busyUntil = end;
      return { start, end };
    }
    return null;
  }
}

// The frequency of a square wave on a pin (a passive buzzer driven by tone()): rising edges in the last
// window. 0 when the pin stopped toggling.
export class FrequencyMeter {
  #edges = [];
  #last = false;
  #window;

  constructor({ windowCycles = usToCycles(100000) } = {}) {
    this.#window = windowCycles;
  }

  update(level, cycles) {
    if (level && !this.#last) this.#edges.push(cycles);
    this.#last = level;
    this.#trim(cycles);
  }

  #trim(cycles) {
    while (this.#edges.length && this.#edges[0] < cycles - this.#window) this.#edges.shift();
    if (this.#edges.length > 4000) this.#edges.splice(0, this.#edges.length - 4000);
  }

  hz(cycles) {
    this.#trim(cycles);
    const e = this.#edges;
    if (e.length < 3 || cycles - e[e.length - 1] > this.#window / 2) return 0;
    return Math.round(((e.length - 1) * F_CPU) / (e[e.length - 1] - e[0]));
  }
}

// How much of the time a pin was high since the last read (an LED's brightness with analogWrite)
export class DutyMeter {
  #level = false;
  #at = 0;
  #from = 0;
  #high = 0;

  update(level, cycles) {
    if (this.#level) this.#high += cycles - this.#at;
    this.#level = level;
    this.#at = cycles;
  }

  get level() {
    return this.#level;
  }

  // 0..1 since the previous read; starts a new window
  read(cycles) {
    if (this.#level) this.#high += cycles - this.#at;
    const total = cycles - this.#from;
    const duty = total > 0 ? this.#high / total : this.#level ? 1 : 0;
    this.#from = this.#at = cycles;
    this.#high = 0;
    return clamp(duty, 0, 1);
  }
}

// Servo.h pulses: 544 µs = 0°, 2400 µs = 180°, every ~20 ms. The angle of the last complete pulse.
export const SERVO = { minUs: 544, maxUs: 2400 };

export class ServoMeter {
  #rise = null;
  #angle = null;

  update(level, cycles) {
    if (level && this.#rise === null) this.#rise = cycles;
    else if (!level && this.#rise !== null) {
      const us = ((cycles - this.#rise) * 1e6) / F_CPU;
      this.#rise = null;
      if (us >= 300 && us <= 3000) this.#angle = Math.round(clamp(((us - SERVO.minUs) / (SERVO.maxUs - SERVO.minUs)) * 180, 0, 180));
    }
  }

  get angle() {
    return this.#angle;
  }
}

// One channel of an L298N: IN1/IN2 set the direction, ENA (0..1, the PWM duty) the speed
export function l298nChannel({ in1, in2, enable }) {
  const speed = clamp(Number(enable) || 0, 0, 1);
  if (speed === 0) return { dir: 'coast', speed: 0 };
  if (in1 && !in2) return { dir: 'forward', speed };
  if (!in1 && in2) return { dir: 'backward', speed };
  return { dir: 'brake', speed: 0 };
}
