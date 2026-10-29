/**
 * Guards for the metric registry and the surfaces that display it.
 *
 * These are the checks that would have caught the defects this file was added for:
 * two definitions of one concept in different places, a formula shown with an
 * unresolved placeholder, and a definition table that had drifted from the registry.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import registry from '../src/semantics/registry.json';
import { metrics, describeMetric, displayContext, DEFAULT_COST_RATE } from '../src/semantics/metrics.ts';
import { simpleMetricDefinitions } from '../src/semantics/metric-simple-definitions.ts';
import { businessDefinitions } from '../src/semantics/metric-business-definitions.ts';
import { CUSTOM_METRIC_FORMULAS } from '../src/semantics/metric-formula-overrides.ts';

const ids = Object.keys(metrics);

test('no displayed formula ever contains an unresolved placeholder', () => {
  const ctx = displayContext();
  for (const id of ids) {
    const shown = describeMetric(id, ctx);
    assert.doesNotMatch(shown, /\{cost_rate\}|\{today_ist\}/, `${id} shows an unresolved placeholder`);
  }
  // The default context resolves to real, current values rather than stand-ins.
  assert.match(describeMetric('payroll_cost', ctx), new RegExp(String(DEFAULT_COST_RATE)));
  assert.match(describeMetric('active_memberships', ctx), /^\d{4}-\d{2}-\d{2}$|'\d{4}-\d{2}-\d{2}'/);
});

test('placeholder tokens in the registry are exactly the two the engine substitutes', () => {
  // A typo'd token would silently survive into SQL and into the documentation.
  for (const m of registry as { id: string; expression: string }[]) {
    const tokens = [...m.expression.matchAll(/\{([a-z_]+)\}/g)].map((x) => x[1]);
    for (const token of tokens)
      assert.ok(['cost_rate', 'today_ist'].includes(token), `${m.id} uses unknown placeholder {${token}}`);
  }
});

test('every definition table covers the registry and nothing else', () => {
  const registered = new Set(ids);
  for (const [name, table] of [
    ['simpleMetricDefinitions', simpleMetricDefinitions],
    ['businessDefinitions', businessDefinitions],
  ] as const) {
    const keys = Object.keys(table as Record<string, unknown>);
    const missing = [...registered].filter((id) => !keys.includes(id) && id !== 'records');
    const orphan = keys.filter((id) => !registered.has(id));
    assert.deepEqual(missing, [], `${name} is missing definitions`);
    assert.deepEqual(orphan, [], `${name} defines metrics that no longer exist`);
  }
});

test('the component-level formula dictionary does not shadow a registry metric', () => {
  // The registry is consulted first, so any entry here with a registry id is dead:
  // editing it changes nothing, which is worse than having no entry at all.
  const shadowed = Object.keys(CUSTOM_METRIC_FORMULAS).filter((id) => ids.includes(id));
  assert.deepEqual(shadowed, [], 'unreachable duplicate definitions');
});

test('lead outcomes read the outcome columns, not the pipeline stage', () => {
  // Trial Status and Conversion Status record outcomes. Stage Name is a pipeline
  // position that advances, so counting from it drops everyone who progressed.
  for (const id of ['trials_completed'])
    assert.match(metrics[id].expression, /trial_status/, `${id} must read Trial Status`);
  for (const id of ['converted_leads', 'lead_conversion_rate', 'open_leads', 'untouched_leads', 'pipeline_value'])
    assert.match(metrics[id].expression, /conversion/, `${id} must read Conversion Status`);
  for (const id of ['trials_completed', 'converted_leads', 'lead_conversion_rate', 'open_leads'])
    assert.doesNotMatch(metrics[id].expression, /\bstage\b/, `${id} must not count from Stage Name`);
});

test('one concept has one definition: trials and conversions agree across families', () => {
  // The website_/crm_ family and the general leads family must count the same way,
  // or two cards on the same filtered population will disagree.
  const canonical = (expression: string) => expression.replace(/\s+/g, ' ').trim();
  assert.equal(
    canonical(metrics.trials_completed.expression),
    canonical(metrics.website_trials.expression),
    'trials_completed and website_trials must use the same rule',
  );
  assert.equal(
    canonical(metrics.converted_leads.expression),
    canonical(metrics.website_members.expression),
    'converted_leads and website_members must use the same rule',
  );
});

test('every metric declares a real source sheet and a resolvable table', () => {
  const known = new Set(['Sessions', 'Recurring', 'Teacher Recurring', 'Sales', 'New', 'Payroll', 'Lapsed', 'Bookings', 'Leads', 'Checkins', 'Meta', 'Settings', 'Source']);
  for (const m of registry as { id: string; sources: string[] }[]) {
    assert.ok(m.sources.length > 0, `${m.id} declares no source`);
    for (const source of m.sources)
      assert.ok(known.has(source.split('.')[0]), `${m.id} declares unknown sheet ${source}`);
  }
});

/** Splits `LEAST(a,b)` / `GREATEST(a,b)` arguments, respecting nested parentheses. */
function clampTerms(expression: string): { fn: string; arg: string }[] {
  const out: { fn: string; arg: string }[] = [];
  const re = /\b(LEAST|GREATEST)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expression))) {
    const open = m.index + m[0].length;
    let depth = 1;
    let i = open;
    for (; i < expression.length && depth > 0; i++) {
      if (expression[i] === "(") depth++;
      else if (expression[i] === ")") depth--;
    }
    if (depth !== 0) continue;
    const body = expression.slice(open, i - 1);
    let depth2 = 0;
    let last = 0;
    for (let j = 0; j < body.length; j++) {
      const ch = body[j];
      if (ch === "(") depth2++;
      else if (ch === ")") depth2--;
      else if (ch === "," && depth2 === 0) {
        out.push({ fn: m[1], arg: body.slice(last, j).trim() });
        last = j + 1;
      }
    }
    out.push({ fn: m[1], arg: body.slice(last).trim() });
  }
  return out;
}

test('a clamped term never lets a missing input masquerade as an extreme', () => {
  // DuckDB's LEAST/GREATEST ignore NULL and return the non-null argument, so
  // `LEAST(days_absent/60, 1)` silently scored an unknown absence as the *maximum*
  // penalty — and did it before the COALESCE fallback below could ever fire.
  // A clamped term whose value can be NULL must say what NULL means.
  for (const id of ids)
    for (const { fn, arg } of clampTerms(metrics[id].template)) {
      // A division (or any function call) can produce NULL; a plain column or literal
      // cannot, and callers guard those with `IS NOT NULL` in a CASE.
      const canBeNull = arg.includes("/") || /[a-z_]+\s*\(/i.test(arg);
      if (!canBeNull) continue;
      if (/^COALESCE\(/.test(arg)) continue;
      assert.fail(
        `${id}: ${fn}(${arg}) — a NULL here collapses to the bound. Wrap it in ` +
          `COALESCE, or return NULL from a CASE so the fallback below can fire.`,
      );
    }
});
