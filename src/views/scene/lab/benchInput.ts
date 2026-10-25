// A tiny object shared between the bench and MapInput. MapInput listens on the canvas itself, before R3F
// sees the event, so it cannot know a press landed on something of the bench. The bench's things register
// a claim (does this screen point hit me?) and MapInput skips its pan when any of them says yes.
//
// - `claims`: what MapInput calls. LabBench assigns its own claim to it (`benchInput.claims = fn`, and null
//   when it goes away); reading it gives one function that asks LabBench's claim and every extra claimer.
// - `claim(fn)`: registers another claimer (Qubi) and returns the function that removes it. Any number can
//   be registered, and they never replace LabBench's.

type Claim = (clientX: number, clientY: number) => boolean;

let own: Claim | null = null;
const extra = new Set<Claim>();

const combined: Claim = (x, y) => {
  if (own?.(x, y)) return true;
  for (const fn of extra) if (fn(x, y)) return true;
  return false;
};

export const benchInput: {
  claims: Claim | null;
  claim(fn: Claim): () => void;
  dragging: boolean; // a part is being dragged right now
} = {
  get claims() {
    return own || extra.size ? combined : null;
  },
  set claims(fn: Claim | null) {
    own = fn;
  },
  claim(fn) {
    extra.add(fn);
    return () => {
      extra.delete(fn);
    };
  },
  dragging: false,
};
