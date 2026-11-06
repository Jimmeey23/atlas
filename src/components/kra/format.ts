import { fmt } from '../../semantics/formats';

/**
 * KRA figures are read at four different magnitudes — headline rupees in crores,
 * single payments in lakhs, rates as a one-decimal percentage, and small cohort
 * counts. One `fmt` call cannot serve all four legibly, so the page formats
 * explicitly and keeps `fmt` for the shared registry formats only.
 */

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const INTEGER = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const count = (value: unknown): string => (value == null || !Number.isFinite(Number(value)) ? '—' : INTEGER.format(Number(value)));

/** Compact rupees for headline figures: ₹9.91Cr, ₹14.2L, ₹8,400. */
export function rupees(value: unknown): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  const absolute = Math.abs(amount);
  if (absolute >= 1e7) return `₹${(amount / 1e7).toFixed(absolute >= 1e8 ? 1 : 2)}Cr`;
  if (absolute >= 1e5) return `₹${(amount / 1e5).toFixed(1)}L`;
  return INR.format(amount);
}

/** Full rupees, for tables where two figures sit side by side and rounding would hide the gap. */
export const rupeesFull = (value: unknown): string => (value == null || !Number.isFinite(Number(value)) ? '—' : INR.format(Number(value)));

export const percent = (value: unknown, digits = 1): string => (value == null || !Number.isFinite(Number(value)) ? '—' : `${(Number(value) * 100).toFixed(digits)}%`);

/** A relative movement, always signed. */
export function growth(value: unknown, digits = 1): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const amount = Number(value);
  return `${amount > 0 ? '+' : ''}${(amount * 100).toFixed(digits)}%`;
}

/** Percentage points, used for rate-versus-rate comparisons where relative growth misleads. */
export function points(value: unknown): string | null {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const amount = Number(value) * 100;
  return `${amount > 0 ? '+' : ''}${amount.toFixed(1)}pp`;
}

export const decimal = (value: unknown, digits = 1): string => (value == null || !Number.isFinite(Number(value)) ? '—' : Number(value).toFixed(digits));

export { fmt };
