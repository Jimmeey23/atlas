import { useEffect, useState } from "react";

/** Runs an async loader whenever its inputs change; a stale result never overwrites a newer one. */
export function useBoardData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({
    data: null,
    loading: true,
    error: "",
  });
  useEffect(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    load()
      .then((data) => active && setState({ data, loading: false, error: "" }))
      .catch((e) => active && setState({ data: null, loading: false, error: String(e?.message || e) }));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
