// HTML labels that follow 3D points on screen (folder names, floors, the Supabase status).
export function createLabelLayer(container, sceneView) {
  const labels = new Set();

  // align 'top': above the point; 'left': to its left, vertically centered
  function add({ html = '', anchor = { x: 0, y: 0, z: 0 }, className = '', align = 'top', hidden = false }) {
    const el = document.createElement('div');
    el.className = `map-label ${className}`;
    el.innerHTML = html;
    el.hidden = hidden;
    container.appendChild(el);
    const label = {
      el,
      anchor: { ...anchor },
      align,
      setAnchor(x, y, z) { Object.assign(this.anchor, { x, y, z }); },
      remove() { el.remove(); labels.delete(label); },
    };
    labels.add(label);
    return label;
  }

  // Call once per frame, after the views moved their anchors
  function update() {
    for (const { el, anchor, align } of labels) {
      if (el.hidden) continue;
      const p = sceneView.toScreen(anchor);
      const shift = align === 'left' ? 'translate(calc(-100% - 8px), -50%)' : 'translate(-50%, -100%)';
      el.style.transform = `translate(${p.x}px, ${p.y}px) ${shift}`;
    }
  }

  return { add, update };
}
