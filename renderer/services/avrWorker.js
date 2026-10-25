// The Arduino lab's emulator thread (spec/005-arduino-lab.md): the real-time loop (models/arduino/
// emulatorLoop.js) over avr8js (renderer/vendor/avr8js.js, from npm run vendor). Only what the parts show
// and the serial text go back to the page.
import * as avr from '../vendor/avr8js.js';
import { createEmulatorLoop } from '../models/arduino/emulatorLoop.js';

const loop = createEmulatorLoop({ avr, post: (message) => self.postMessage(message) });
self.onmessage = (event) => loop.handle(event.data);
self.postMessage({ type: 'ready' }); // avr8js loaded: the page can stop waiting
