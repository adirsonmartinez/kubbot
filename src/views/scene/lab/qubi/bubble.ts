// Where Qubi's speech bubble goes on screen (pure): over his head when it fits, below his feet when his
// head is at the top edge, and always inside the viewport. The tail keeps pointing at his head.

export type Pt = { x: number; y: number };

export type BubbleLayout = {
  left: number; // top-left corner of the bubble, in pixels of the viewport
  top: number;
  tailX: number; // where the tail sits along the bubble's width
  below: boolean; // the bubble is under him (the tail points up)
};

export function layoutBubble(o: {
  head: Pt; // screen point just above his head
  foot: Pt; // screen point under his feet
  width: number;
  height: number;
  viewport: { width: number; height: number };
  margin?: number;
  gap?: number;
  tailInset?: number;
}): BubbleLayout {
  const margin = o.margin ?? 10;
  const gap = o.gap ?? 10;
  const inset = o.tailInset ?? 16;
  const maxLeft = o.viewport.width - o.width - margin;
  const left = maxLeft < margin ? margin : Math.min(maxLeft, Math.max(margin, o.head.x - o.width / 2));
  let top = o.head.y - gap - o.height;
  let below = false;
  if (top < margin) {
    below = true;
    top = o.foot.y + gap;
  }
  const maxTop = o.viewport.height - o.height - margin;
  top = maxTop < margin ? margin : Math.min(maxTop, Math.max(margin, top));
  const tailX = Math.min(o.width - inset, Math.max(inset, o.head.x - left));
  return { left, top, tailX, below };
}

// Keeps the bubble short and on one idea: whitespace collapsed, cut at a word with an ellipsis
export function shortText(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.¡!¿?-]+$/, "")}…`;
}
