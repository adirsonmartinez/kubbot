// The robot on the map. Four jobs, one robot (views/scene/guideRobot.js), in this order:
//   - tour (TourViewModel.guide): it glides to each stop, points at it and says what it is;
//   - building (BuildViewModel.guide): it carries each file the agent saves to its folder and drops it in;
//   - welcome: on a new, empty project (MapViewModel.welcome) it waves and asks what to build;
//   - companion (RobotViewModel): it waits on the plaza; the person grabs it, drags or throws it onto a
//     folder, and it asks what to do there. While an agent works it shows, in its bubble, the same
//     thinking orb and words as the chat's working card.
// `grabber` is what the map's input controller drags instead of the map when the pointer is on it.
import { createGuideRobot } from './guideRobot.js';
import { strings } from '../../i18n/es.js';
import { thinkingOrb } from '../ui/thinkingOrb.js';
import { orbKeyOf, orbStateOf } from '../ui/runCardView.js';

const SPOT = { x: 1.1, z: 1.1 }; // front corner of the plaza, so the bubble clears the project's label
const HELD_LIFT = 1.4;
const THROW_ARC = 2.6;
const R = strings.robot;

// The bot message that is working right now (an agent's run, a repair, or the chat "typing"), or null
function working(state) {
  const run = state.messages.findLast((m) => m.run?.status === 'running' && !m.run.queued);
  if (run) return run;
  return state.typing ? { role: 'bot', text: '' } : null;
}

export function createRobotView({ sceneView, labels, mapViewModel, tourViewModel = null, buildViewModel = null, robotViewModel = null, chatViewModel = null, cameraViewModel = null }) {
  const robot = createGuideRobot({ sceneView, labels });
  robot.object.userData.pick = { type: 'robot' };
  let job = null;     // 'tour' | 'welcome' | 'companion' | null
  let stepId = null;
  let hovered = false;
  let activity = null; // { state, label, orb } while an agent works
  let lastFlight = null;

  // What the companion says: the agent's state while it works, else its own question, else a hint on hover
  const companionWords = () => {
    if (activity) return { text: activity.label, orb: activity.orb };
    const s = robotViewModel.store.state;
    if (s.mode === 'held') return { text: s.over ? R.dropHere(s.over) : R.hint };
    if (s.bubble) return s.bubble;
    return hovered ? { text: R.hint } : null;
  };

  const apply = () => {
    const guide = tourViewModel?.store.state.guide;
    if (guide) {
      if (job !== 'tour') { robot.show(true); robot.lift(0); robot.carry(false); robot.place(guide.from); job = 'tour'; stepId = null; }
      if (guide.stepId !== stepId) {
        stepId = guide.stepId;
        robot.moveTo(guide.to, guide.walkMs);
        robot.pointAt(guide.center);
      }
      robot.say({ title: guide.title, text: guide.text });
      return;
    }
    const work = buildViewModel?.store.state.guide;
    if (work) {
      if (job !== 'build') {
        if (!robot.visible) robot.place(work.from); // else it sets off from where it is
        robot.show(true);
        robot.lift(0);
        job = 'build';
        stepId = null;
      }
      if (work.stepId !== stepId) {
        stepId = work.stepId;
        const phase = work.stepId.split(':').pop();
        if (phase === 'carry') { robot.moveTo(work.to, work.walkMs); robot.pose('carry'); robot.carry(true); }
        else if (phase === 'drop') { robot.face(work.center); robot.pose('drop'); robot.carry(false); }
        else if (phase === 'edit') { robot.carry(false); robot.pointAt(work.center); }
        else if (phase === 'done') { robot.carry(false); robot.face({ yaw: cameraViewModel?.azimuth ?? Math.PI / 4 }); robot.pose('wave'); }
        else { robot.carry(false); robot.pose('idle'); }
      } else if (work.pose === 'wait' || work.pose === 'carry') robot.pose(work.pose);
      robot.say({ title: work.title, text: work.text, orb: activity?.orb });
      return;
    }
    stepId = null;
    if (mapViewModel.store.state.welcome) {
      if (job !== 'welcome') {
        robot.show(true);
        robot.lift(0);
        robot.place(SPOT);
        robot.face({ yaw: Math.PI / 4 }); // faces the camera
        robot.pose('wave');
        robot.say({ title: strings.map.welcome.title, text: strings.map.welcome.question });
        job = 'welcome';
      }
      return;
    }
    const companion = robotViewModel?.store.state;
    if (companion?.visible) {
      if (job !== 'companion') {
        // back from a job: it walks home; otherwise it appears there
        if (robot.visible && job) robot.moveTo(companion.at, 900); else robot.place(companion.at);
        robot.show(true);
        robot.carry(false);
        lastFlight = null;
        job = 'companion';
      }
      switch (companion.mode) {
        case 'held':
          robot.pose('held');
          robot.lift(HELD_LIFT);
          robot.place(companion.at);
          break;
        case 'flying':
          if (companion.flight !== lastFlight) {
            lastFlight = companion.flight;
            robot.pose('held');
            robot.lift(0);
            robot.moveTo(companion.flight.to, companion.flight.ms, { arc: THROW_ARC });
          }
          break;
        case 'here':
          robot.lift(0);
          if (companion.place?.center) robot.pointAt(companion.place.center);
          else robot.pose('wave');
          break;
        default: {
          const at = robot.position;
          if (!robot.moving && Math.hypot(at.x - companion.at.x, at.z - companion.at.z) > 0.05) robot.place(companion.at); // sent home
          robot.lift(0);
          robot.pose('idle');
          robot.face({ yaw: cameraViewModel?.azimuth ?? Math.PI / 4 });
        }
      }
      robot.say(companionWords());
      return;
    }
    job = null;
    robot.say(null);
    robot.show(false);
  };

  mapViewModel.store.subscribe(apply, { immediate: true });
  tourViewModel?.store.subscribe(apply);
  buildViewModel?.store.subscribe(apply);
  robotViewModel?.store.subscribe(apply);
  // The agent's state, as in the chat's working card: a new orb only when the state changes
  chatViewModel?.store.subscribe((state) => {
    const message = working(state);
    if (!message) {
      if (activity) { activity = null; apply(); }
      return;
    }
    const orbState = orbStateOf(message);
    const label = strings.chat.orbLabels[orbKeyOf(message)] ?? strings.chat.orbLabels.working;
    if (activity?.state === orbState && activity.label === label) return;
    activity = { state: orbState, label, orb: thinkingOrb(orbState, { size: 22, label }) };
    if (job === 'companion') robot.say(companionWords());
    else if (job === 'build') apply();
  }, { immediate: true });
  sceneView.onFrame((_t, dt) => robot.update(dt));

  // Dragging and throwing: screen points become ground points; the speed of the last moves is the throw
  let samples = [];
  const ground = (x, y) => sceneView.groundPointAt(x, y);
  const grabber = {
    last: null,
    hit: (x, y) => job === 'companion' && Boolean(sceneView.pickAt(x, y, [robot.object])),
    hover(on) {
      hovered = on;
      if (job === 'companion') robot.say(companionWords());
    },
    start(x, y) {
      if (!robotViewModel.grab()) return;
      samples = [];
      this.move(x, y);
    },
    move(x, y) {
      this.last = { x, y };
      const p = ground(x, y);
      if (!p) return;
      samples.push({ x: p.x, z: p.z, t: performance.now() });
      samples = samples.filter((s) => samples.at(-1).t - s.t < 90);
      robotViewModel.drag({ x: p.x, z: p.z });
    },
    end(x, y) {
      const p = ground(x, y) ?? robotViewModel.store.state.at;
      const first = samples[0];
      const last = samples.at(-1);
      const dt = first && last ? (last.t - first.t) / 1000 : 0;
      const v = dt > 0.01 ? { vx: (last.x - first.x) / dt, vz: (last.z - first.z) / dt } : { vx: 0, vz: 0 };
      robotViewModel.release({ x: p.x, z: p.z, ...v });
      samples = [];
    },
  };
  return { grabber, get hands() { return robot.hands; } };
}
