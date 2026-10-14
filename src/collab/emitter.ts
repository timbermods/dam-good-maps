/** A very small typed event emitter (no Node, no DOM): `on` returns the function that removes the listener. */
export class Emitter<Events extends object> {
  private listeners: { [K in keyof Events]?: Set<(value: Events[K]) => void> } = {};

  on<K extends keyof Events>(event: K, fn: (value: Events[K]) => void): () => void {
    (this.listeners[event] ??= new Set()).add(fn);
    return () => this.listeners[event]?.delete(fn);
  }

  protected emit<K extends keyof Events>(event: K, value: Events[K]): void {
    for (const fn of [...(this.listeners[event] ?? [])]) {
      try {
        fn(value);
      } catch (e) {
        // a listener's bug must not break the connection
        console.error("collab listener failed", e);
      }
    }
  }
}
