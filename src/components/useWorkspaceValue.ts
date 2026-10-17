import { useState, type Dispatch, type SetStateAction } from 'react';
import { workspaceTables } from '../state/workspaceLayout';

/** Keep hierarchy controls isolated per tab and grouping, even while tabs unmount. */
export function useWorkspaceValue<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const read = () => Object.hasOwn(workspaceTables, key) ? workspaceTables[key] as T : initial;
  const [state, setState] = useState(() => ({ key, value: read() }));
  const value = state.key === key ? state.value : read();
  if (state.key !== key) setState({ key, value });
  return [value, update => {
    const next = typeof update === 'function' ? (update as (previous: T) => T)(read()) : update;
    workspaceTables[key] = next;
    setState({ key, value: next });
  }];
}
