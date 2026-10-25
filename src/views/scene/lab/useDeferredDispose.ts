// Calls dispose() when the component unmounts, one tick later. In development React mounts, unmounts and
// mounts again; mounting again cancels the pending dispose, so the object survives it.

import { useEffect } from "react";

const pending = new WeakMap<object, ReturnType<typeof setTimeout>>();

export function useDeferredDispose(object: { dispose: () => void } | null) {
  useEffect(() => {
    if (!object) return;
    clearTimeout(pending.get(object));
    return () => {
      pending.set(
        object,
        setTimeout(() => {
          pending.delete(object);
          object.dispose();
        }, 0),
      );
    };
  }, [object]);
}
