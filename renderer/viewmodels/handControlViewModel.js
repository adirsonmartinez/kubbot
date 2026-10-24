// Moving the map with a hand in front of the camera (off by default). The tracking service turns the
// camera image into hand landmarks; PinchTracker turns them into a drag; this pans the map like a mouse
// drag (the map follows the pinch) or turns it (pinch and turn the hand like a knob). Frames never leave
// the computer.
import { Observable } from '../core/observable.js';
import { PinchTracker } from '../models/handGesture.js';
import { CAMERA } from './cameraViewModel.js';

// A drag across the whole camera image moves the map this many screens (a short hand move goes far)
const PAN_GAIN = 1.6;
// Screen down is the ground seen at an angle, so it spans more ground than screen across
const DEPTH_STRETCH = 1 / Math.sin(CAMERA.elevation);
// A quarter turn of the hand turns the map this many quarter turns (wrists do not turn far)
const ROTATE_GAIN = 1.5;

const ERRORS = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'noCamera', OverconstrainedError: 'noCamera' };

export class HandControlViewModel {
  #tracking;
  #camera;
  #tracker = new PinchTracker();
  #run = 0; // increases each time it turns on or off, so late frames are ignored

  // status: 'off' | 'starting' | 'on' | 'error'; hand: a hand is in view; pinching: it holds the map;
  // gesture: what the pinch is doing, null (not decided yet) | 'pan' | 'rotate'
  store = new Observable({ status: 'off', error: null, hand: false, pinching: false, gesture: null });

  constructor({ tracking, camera }) {
    this.#tracking = tracking;
    this.#camera = camera;
  }

  get on() {
    return this.store.state.status === 'on' || this.store.state.status === 'starting';
  }

  async toggle() {
    if (this.on) return this.stop();
    const run = ++this.#run;
    this.#tracker = new PinchTracker();
    this.store.set({ status: 'starting', error: null, hand: false, pinching: false, gesture: null });
    try {
      await this.#tracking.start((landmarks) => { if (run === this.#run) this.#onHand(landmarks); });
      if (run === this.#run) this.store.set({ status: 'on' });
    } catch (error) {
      if (run !== this.#run) return;
      this.#tracking.stop();
      this.store.set({ status: 'error', error: ERRORS[error?.name] ?? 'failed' });
    }
  }

  stop() {
    this.#run++;
    this.#tracking.stop();
    this.store.set({ status: 'off', error: null, hand: false, pinching: false, gesture: null });
  }

  #onHand(landmarks) {
    const { pinching, mode: gesture, dx, dy, dAngle } = this.#tracker.update(landmarks);
    const hand = Boolean(landmarks);
    const now = this.store.state;
    if (hand !== now.hand || pinching !== now.pinching || gesture !== now.gesture) this.store.set({ hand, pinching, gesture });
    // A higher azimuth takes the camera counterclockwise around the map: the map turns clockwise, like the hand
    if (dAngle) this.#camera.turnBy(dAngle * ROTATE_GAIN);
    if (!dx && !dy) return;
    // The map follows the hand, so the camera moves the other way (same screen axes as the arrow keys)
    const span = (CAMERA.viewHeight / this.#camera.zoom) * PAN_GAIN;
    const right = -dx * span, back = -dy * span * DEPTH_STRETCH;
    const az = this.#camera.azimuth;
    this.#camera.glideBy(Math.cos(az) * right + Math.sin(az) * back, -Math.sin(az) * right + Math.cos(az) * back);
  }
}
