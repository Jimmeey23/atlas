export const EXCLUDED_MEMBERSHIP_TERMS: string[];
export const EXCLUDED_MEMBERSHIP_PATTERNS: RegExp[];
export function eligibleMembership(row: Record<string, unknown>): boolean;
export function recordedChurn(rows: Record<string, unknown>[], from: string, to: string, asOf: string): unknown;
export function churnMaturity(rows: Record<string, unknown>[], from: string, to: string, asOf: string, settleDays?: number): unknown;
