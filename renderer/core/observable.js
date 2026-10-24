// Minimal reactive state container shared by models and view models.
// Views subscribe and re-render; nobody mutates `state` directly, always through set().
export class Observable {
  #state;
  #listeners = new Set();

  constructor(initialState) {
    this.#state = initialState;
  }

  get state() {
    return this.#state;
  }

  set(patch) {
    const previous = this.#state;
    this.#state = { ...previous, ...patch };
    for (const listener of this.#listeners) listener(this.#state, previous);
  }

  // Returns an unsubscribe function. With `immediate`, the listener runs once right away.
  subscribe(listener, { immediate = false } = {}) {
    this.#listeners.add(listener);
    if (immediate) listener(this.#state, undefined);
    return () => this.#listeners.delete(listener);
  }
}
