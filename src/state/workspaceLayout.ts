import type { TreeRow } from '../components/NestedTable';

export const WORKSPACE_KEY = 'atlas-workspace-v1';
export type WorkspaceScope = { tab: number; view: string; filters: unknown; compare: string; transient: unknown };
export type WorkspaceSnapshot = {
  version: 1;
  savedAt: string;
  active: string;
  scopes: Record<string, WorkspaceScope>;
  orders: Record<string, string[]>;
  drills: Record<string, TreeRow | null>;
  tables?: Record<string, unknown>;
  elements?: Record<string, ElementOverride>;
  preferences: unknown;
  theme: string;
  density: string;
  rate: number;
};
export function readWorkspace(): WorkspaceSnapshot | null {
  try {
    const value = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || 'null');
    return value?.version === 1 && value.scopes && value.orders && value.drills ? value : null;
  } catch { return null; }
}
export const savedWorkspace = readWorkspace();
export const workspaceOrders = savedWorkspace?.orders || {};
export const workspaceDrills = savedWorkspace?.drills || {};
export const workspaceScopes = savedWorkspace?.scopes || {};
export const workspaceKey = (tab: number, view: string) => `${tab}:${view}`;

export const workspaceTables: Record<string, unknown> = savedWorkspace?.tables || {};

export type ElementOverride = { text?: string; styles?: Record<string, string>; attributes?: Record<string, string> };
export const workspaceElements: Record<string, ElementOverride> = savedWorkspace?.elements || {};

export function saveWorkspace(settings: Pick<WorkspaceSnapshot, 'active' | 'preferences' | 'theme' | 'density' | 'rate'>) {
  const snapshot: WorkspaceSnapshot = {
    version: 1, savedAt: new Date().toISOString(), ...settings,
    scopes: workspaceScopes, orders: workspaceOrders, drills: workspaceDrills,
    tables: workspaceTables, elements: workspaceElements,
  };
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(snapshot));
  return snapshot;
}
