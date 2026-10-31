import { sheets } from "./sheets.config";
import { blueprints } from "./blueprints";

// Sources required for the main workspace analysis. Overview cards load their
// own additional sources and report their own loading or error state.
export const dependencies = (tab: number) =>
  tab === 11
    ? sheets.map((s) => s.key)
    : [
        ...new Set([
          blueprints[tab].source,
          ...(tab === 1 ? ["bookings", "checkins"] : tab === 0 ? ["new", "sales", "lapsed"] : tab === 3 ? ["payroll", "new", "bookings", "checkins"] : tab === 5 ? ["sales", "bookings", "checkins"] : tab === 14 ? ["new", "bookings"] : tab === 8 ? ["new"] : tab === 9 ? ["sessions"] : tab === 6 ? ["new", "checkins"] : tab === 15 ? ["sales", "new", "lapsed", "leads", "payroll", "recurring", "bookings"] : []),
        ]),
      ];
