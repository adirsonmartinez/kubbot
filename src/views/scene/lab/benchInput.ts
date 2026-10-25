// A tiny object shared between the bench and MapInput. MapInput listens on the canvas itself, before R3F
// sees the event, so it cannot know a press landed on a part. LabBench registers `claims` (does this
// screen point hit a part or a pin?) and MapInput skips its pan when it says yes.

export const benchInput: {
  claims: ((clientX: number, clientY: number) => boolean) | null;
  dragging: boolean; // a part is being dragged right now
} = { claims: null, dragging: false };
