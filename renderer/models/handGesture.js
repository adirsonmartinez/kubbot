// Hand gestures from the camera, as plain numbers (no DOM, no camera). The hand comes as MediaPipe's
// 21 landmarks in image coordinates (0..1, x to the right of the image, y down).
// Pinch (thumb and index tips together) grabs the map. While pinching, the hand either drags it (the palm
// moves) or turns it (the hand turns like a knob, the palm stays): the first one past its threshold wins
// until the hand lets go, so a drag never turns the map by accident and a turn never drags it. Opening the
// hand or losing it lets go. Thresholds are relative to the hand's size, so distance to the camera does not matter.
const WRIST = 0, THUMB_TIP = 4, INDEX_KNUCKLE = 5, INDEX_TIP = 8, MIDDLE_KNUCKLE = 9, PINKY_KNUCKLE = 17;

const PINCH_ON = 0.3;    // tips closer than this (× hand size) grab
const PINCH_OFF = 0.45;  // and farther than this let go (in between, it keeps its state)
const SMOOTHING = 0.5;   // share of the new position in each frame (the rest is the previous one)
const DEAD_ZONE = 0.004; // movement smaller than this (image units) is tremor, not a drag
const ANGLE_DEAD_ZONE = 0.01; // radians
const PAN_LOCK = 0.15;   // the palm moved this much (× hand size): it is a drag
const ROTATE_LOCK = 0.2; // the hand turned this much (radians, ~11°) first: it is a turn

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const still = (pinching, mode = null) => ({ pinching, mode, dx: 0, dy: 0, dAngle: 0 });
// Shortest signed difference between two angles
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

function palmOf(l) {
  return {
    x: (l[WRIST].x + l[INDEX_KNUCKLE].x + l[PINKY_KNUCKLE].x) / 3,
    y: (l[WRIST].y + l[INDEX_KNUCKLE].y + l[PINKY_KNUCKLE].y) / 3,
  };
}

// Direction of the hand (wrist to middle knuckle) as the person sees it: mirrored, so a growing angle is a
// clockwise turn for them
const angleOf = (l) => Math.atan2(l[MIDDLE_KNUCKLE].y - l[WRIST].y, -(l[MIDDLE_KNUCKLE].x - l[WRIST].x));

export class PinchTracker {
  #grab = null; // while pinching: { mode, at, sent, angle, sentAngle, palm0, angle0 }

  // landmarks: the hand's 21 points, or null when no hand is in view. Returns { pinching, mode, dx, dy,
  // dAngle }: mode is null (not decided yet), 'pan' or 'rotate'; dx, dy is the drag since the last frame
  // as the person sees it (mirrored in x); dAngle the turn since the last frame (clockwise > 0).
  update(landmarks) {
    if (!landmarks) return this.#release();
    const size = dist(landmarks[WRIST], landmarks[MIDDLE_KNUCKLE]) || 1;
    const gap = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / size;
    if (!this.#grab && gap >= PINCH_ON) return still(false);
    if (this.#grab && gap > PINCH_OFF) return this.#release();

    const point = {
      x: (landmarks[THUMB_TIP].x + landmarks[INDEX_TIP].x) / 2,
      y: (landmarks[THUMB_TIP].y + landmarks[INDEX_TIP].y) / 2,
    };
    const angle = angleOf(landmarks);
    const palm = palmOf(landmarks);
    if (!this.#grab) {
      this.#grab = { mode: null, at: point, sent: point, angle, sentAngle: angle, palm0: palm, angle0: angle };
      return still(true);
    }

    const g = this.#grab;
    g.at = { x: g.at.x + (point.x - g.at.x) * SMOOTHING, y: g.at.y + (point.y - g.at.y) * SMOOTHING };
    g.angle += angleDiff(angle, g.angle) * SMOOTHING;
    if (!g.mode) {
      if (Math.abs(angleDiff(g.angle, g.angle0)) > ROTATE_LOCK) g.mode = 'rotate';
      else if (dist(palm, g.palm0) / size > PAN_LOCK) g.mode = 'pan';
      else return still(true);
    }

    if (g.mode === 'rotate') {
      const dAngle = angleDiff(g.angle, g.sentAngle);
      if (Math.abs(dAngle) < ANGLE_DEAD_ZONE) return still(true, 'rotate');
      g.sentAngle = g.angle;
      return { ...still(true, 'rotate'), dAngle };
    }
    const dx = g.at.x - g.sent.x, dy = g.at.y - g.sent.y;
    if (Math.hypot(dx, dy) < DEAD_ZONE) return still(true, 'pan');
    g.sent = g.at;
    return { ...still(true, 'pan'), dx: -dx, dy };
  }

  #release() {
    this.#grab = null;
    return still(false);
  }
}
