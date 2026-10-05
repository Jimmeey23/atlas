import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reasons,
  daysBetween,
  episodeKey,
  followupFor,
  blankFollowup,
} from "../src/data/retention.ts";
const asOf = "2026-10-05";
const active = {
  membership_amount: 1000,
  product: "Studio 12 Class Package",
  status: "Active",
  start_date: "2026-09-01",
  end_date: "2026-10-19",
  remaining: 3,
  session_limit: 10,
  last_visit: "2026-09-15",
  typical_gap: 5,
};
test("renewal and access use current dates, bounded entitlement and explicit status", () => {
  assert.ok(reasons(active, asOf).renewal);
  assert.ok(reasons(active, asOf).unused);
  for (const status of ["Lapsed", "Renewed", "Frozen"]) {
    assert.equal(reasons({ ...active, status }, asOf).renewal, undefined);
    assert.equal(reasons({ ...active, status }, asOf).unused, undefined);
  }
  assert.equal(
    reasons({ ...active, end_date: "2026-10-04" }, asOf).renewal,
    undefined,
  );
  assert.equal(
    reasons({ ...active, start_date: "2026-11-01" }, asOf).renewal,
    undefined,
  );
  assert.equal(reasons({ ...active, remaining: 11 }, asOf).unused, undefined);
  assert.equal(
    reasons({ ...active, membership_amount: 0 }, asOf).renewal,
    undefined,
  );
  assert.equal(
    reasons({ ...active, product: "Studio Complimentary Class" }, asOf).renewal,
    undefined,
  );
  assert.equal(
    reasons(
      { ...active, product: "Studio Single Class", session_limit: 1 },
      asOf,
    ).renewal,
    undefined,
  );
});
test("personal cadence overrides the minimum absence and frozen members stay excluded", () => {
  assert.ok(reasons(active, asOf).attendance);
  assert.equal(
    reasons({ ...active, typical_gap: 15 }, asOf).attendance,
    undefined,
  );
  assert.equal(
    reasons({ ...active, status: "Frozen", lifecycle: "Active" }, asOf)
      .attendance,
    undefined,
  );
  assert.equal(
    reasons({ ...active, last_visit: null }, asOf).attendance,
    undefined,
  );
  assert.equal(
    reasons({ ...active, last_visit: "2026-10-06" }, asOf).attendance,
    undefined,
  );
});
test("newcomer worklist allows time to return and excludes later attendance", () => {
  const row = {
    is_new: 1,
    first_visit: "2026-09-20",
    visits_post: 0,
    last_visit: "2026-09-20",
  };
  assert.ok(reasons(row, asOf).newcomer);
  assert.equal(
    reasons({ ...row, first_visit: "2026-10-01" }, asOf).newcomer,
    undefined,
  );
  assert.equal(
    reasons({ ...row, last_visit: "2026-09-22" }, asOf).newcomer,
    undefined,
  );
  assert.equal(reasons({ ...row, visits_post: 1 }, asOf).newcomer, undefined);
  assert.equal(
    reasons({ ...row, visits_post: null }, asOf).newcomer,
    undefined,
  );
});
test("missing evidence remains missing rather than zero", () => {
  assert.equal(daysBetween(null, asOf), null);
  assert.equal(daysBetween("invalid", asOf), null);
  assert.deepEqual(reasons({}, asOf), {});
});

test("closure applies to the current episode and future cycles keep history", () => {
  const row = { ...active, member_id: "test-member" };
  const closed = {
    ...blankFollowup,
    status: "Closed",
    owner: "Test operator",
    note: "Previous outcome",
    memberVoice: "Resolved concern",
    closedReasons: [episodeKey(row, "renewal"), episodeKey(row, "attendance")],
    history: [blankFollowup],
  };
  assert.equal(followupFor(closed, row, "renewal").status, "Closed");
  assert.equal(
    followupFor(closed, { ...row, source_snapshot: 12345 }, "renewal").status,
    "Closed",
  );
  const future = followupFor(
    closed,
    { ...row, end_date: "2026-11-19" },
    "renewal",
  );
  assert.equal(future.status, "Not started");
  assert.equal(future.owner, "Test operator");
  assert.equal(future.note, "");
  assert.equal(future.memberVoice, "");
  assert.equal(future.history?.length, 1);
  assert.equal(
    followupFor(closed, { ...row, last_visit: "2026-10-20" }, "attendance")
      .status,
    "Not started",
  );
});

test("older closures reopen only after an evidenced later term or attendance event", () => {
  const legacy = {
    ...blankFollowup,
    status: "Closed",
    updatedAt: "2026-10-05T20:00:00Z",
  };
  const row = { ...active, member_id: "test-member" };
  assert.equal(followupFor(legacy, row, "renewal").status, "Closed");
  assert.equal(
    followupFor(legacy, { ...row, start_date: "2026-11-01" }, "renewal").status,
    "Not started",
  );
  assert.equal(
    followupFor(legacy, { ...row, last_visit: "2026-10-06" }, "attendance")
      .status,
    "Closed",
  );
  assert.equal(
    followupFor(legacy, { ...row, last_visit: "2026-10-07" }, "attendance")
      .status,
    "Not started",
  );
});
