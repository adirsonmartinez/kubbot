// Qubi, the lab's agent, as the rest of the app sees him: where his robot is going on the bench, what he
// is doing and saying, the call, and the tasks he was given. No React, no I/O.

// What the robot shows: a gesture is a short animation, an expression is his face until changed
export type QubiGesture = "wave" | "nod" | "think" | "point" | "celebrate" | "shrug" | "work";
export type QubiExpression = "neutral" | "happy" | "focused" | "surprised" | "worried";

// What Qubi is busy with, for the robot's pose and the UI
export type QubiActivity = "idle" | "listening" | "thinking" | "talking" | "working";

// A place on the bench (world units) and, when known, the part he is looking at
export type QubiTarget = { x: number; z: number; part?: string };

export type QubiState = {
  activity: QubiActivity;
  target: QubiTarget | null; // where he walks; null: he stays where he is
  gesture: { name: QubiGesture; at: number } | null; // `at` makes the same gesture replay
  expression: QubiExpression;
  bubble: string | null; // the short line over his head (what he is saying or doing)
};

// A task given to Qubi ("arma una estación del clima"): his plan, with each step's state
export type QubiStepState = "pending" | "doing" | "done" | "failed";
export type QubiTask = {
  id: string;
  goal: string;
  steps: { text: string; state: QubiStepState }[];
  state: "planning" | "working" | "done" | "failed" | "cancelled";
};

// The call: off, or which way he hears and speaks
export type CallMode = "browser" | "elevenlabs";
export type CallState = {
  status: "off" | "connecting" | "on" | "error";
  mode: CallMode | null;
  muted: boolean;
  error: string | null; // a code; the view translates it
};

// What the chat's agent loop reports while it works, so the robot and the call can follow it
export type AgentEvent =
  | { type: "thinking" }
  | { type: "toolStart"; name: string; input: unknown }
  | { type: "toolEnd"; name: string; input: unknown; ok: boolean; part?: string }
  | { type: "reply"; text: string }
  | { type: "plan"; goal: string; steps: string[] }
  | { type: "step"; index: number; state: QubiStepState }
  | { type: "done" }
  | { type: "error" };
