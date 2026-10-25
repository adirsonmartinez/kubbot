// Which catalog part is being dragged. dataTransfer values cannot be read during dragover, only on
// drop, so the catalog notes the type here for the drop zone's ghost.

let dragged: string | null = null;

export const noteDragStart = (type: string): void => {
  dragged = type;
};
export const noteDragEnd = (): void => {
  dragged = null;
};
export const draggedPart = (): string | null => dragged;
