/** Isolated UI state: flipping never invalidates analytics or notifies unrelated cards. */
export function createMetricFlipStore() {
  let active: string | null = null;
  const listeners = new Map<string, Set<() => void>>();
  return {
    isActive: (id: string) => active === id,
    subscribe(id: string, callback: () => void) {
      const group = listeners.get(id) ?? new Set<() => void>();
      group.add(callback);
      listeners.set(id, group);
      return () => {
        group.delete(callback);
        if (!group.size) listeners.delete(id);
      };
    },
    set(id: string, value = active !== id) {
      const previous = active;
      const next = value ? id : active === id ? null : active;
      if (previous === next) return;
      active = next;
      // React may unsubscribe/resubscribe synchronously during notification. Iterating
      // a live Set can revisit added entries forever; snapshot both affected groups first.
      const callbacks = [previous, next].flatMap(key => key == null ? [] : [...(listeners.get(key) ?? [])]);
      callbacks.forEach(callback => callback());
    },
  };
}
export const metricFlipStore = createMetricFlipStore();
