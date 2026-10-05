import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Failed to load resource"))
    errors.push(m.text());
});
page.on("request", (r) => {
  if (r.url().includes("/api/sheets/"))
    requests.push(r.url().split("/api/sheets/")[1]);
});
try {
  const report = { url: "http://localhost:5174", errors };
  const usable = async () => {
    await page.locator('main[aria-busy="false"]').waitFor();
    await page.waitForFunction(
      () =>
        document.querySelector(".metric-value")?.textContent !== "—" &&
        !!document.querySelector(".metric-value"),
    );
  };
  let started = performance.now();
  await page.goto(report.url);
  await usable();
  report.emptyBrowserSavedSnapshotMs = Math.round(performance.now() - started);
  const rowSnapshot=await page.evaluate(async()=>{
    const {query,health}=window.__floorDiagnostics;
    const rows=await query('SELECT COUNT(DISTINCT source_snapshot) AS versions,MIN(source_snapshot) AS snapshot FROM sessions');
    return {...rows[0],expected:health.sessions.fetchedAt};
  });
  assert.equal(rowSnapshot.versions,1);
  assert.equal(rowSnapshot.snapshot,rowSnapshot.expected);
  report.rowProvenance='snapshot version stored in facts';
  report.initialRequestedSources = [
    ...new Set(requests.map((r) => r.split("?")[0])),
  ];
  assert.deepEqual(report.initialRequestedSources.sort(), ["new", "sessions"]);
  await page.screenshot({ path: "screenshots/upgrades-overview.png" });
  started = performance.now();
  await page.reload();
  await usable();
  report.warmBrowserMs = Math.round(performance.now() - started);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Renewals & retention", exact: true })
    .click();
  await page.locator(".retention-worklists").waitFor();
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".retention-worklists")
        ?.textContent?.includes("Preparing member evidence"),
  );
  assert.equal(
    await page.locator('.retention-worklists [role="alert"]').count(),
    0,
  );
  await page.getByRole("button",{name:"Clear all filters",exact:true}).click();
  await page.waitForTimeout(400);
  report.worklistCounts = {};
  for (const label of [
    "Renewals due",
    "Attendance gaps",
    "Second-session return",
    "Unused access",
    "Member concerns",
  ]) {
    await page
      .getByRole("group", { name: "Choose a worklist" })
      .getByRole("button", { name: new RegExp("^" + label) })
      .click();
    report.worklistCounts[label] = await page
      .locator(".worklist-pagination>span")
      .innerText();
  }
  await page
    .getByRole("group", { name: "Choose a worklist" })
    .getByRole("button", { name: /^Unused access/ })
    .click();
  await page.screenshot({ path: "screenshots/upgrades-retention-matte.png" });
  const rows = page.locator(".worklist-table tbody tr");
  assert.ok((await rows.count()) > 0);
  await rows.first().locator(".member-worklist-link").click();
  await page.getByRole("dialog", { name: /Follow-up for/ }).waitFor();
  await page
    .getByRole("button", { name: "View original fields" })
    .first()
    .click();
  await page.getByText("Original source fields", { exact: true }).waitFor();
  assert.ok((await page.locator(".followup-panel .detail-field").count()) > 0);
  // UI save/reload journey uses isolated follow-up state. Workbook facts remain real.
  let fixture = {};
  await page.route("**/api/retention-followups**", async (route) => {
    if (route.request().method() === "PUT") {
      const draft = route.request().postDataJSON(),
        id = decodeURIComponent(route.request().url().split("/").at(-1));
      fixture[id] = {
        ...draft,
        updatedAt: new Date().toISOString(),
        history: [draft],
      };
      await route.fulfill({ json: fixture[id] });
    } else await route.fulfill({ json: fixture });
  });
  await page
    .getByLabel("Follow-up owner", { exact: true })
    .fill("Verification operator");
  await page
    .locator(".followup-form select")
    .first()
    .selectOption("Contact planned");
  await page
    .getByLabel("Member’s verbatim concern or barrier")
    .fill("Member stated a scheduling barrier.");
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await page.getByText("Follow-up saved.", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page
    .getByRole("group", { name: "Choose a worklist" })
    .getByRole("button", { name: /^Member concerns/ })
    .click();
  assert.equal(await page.locator(".worklist-table tbody tr").count(), 1);
  await page.locator(".member-worklist-link").first().click();
  assert.equal(
    await page.getByLabel("Follow-up owner", { exact: true }).inputValue(),
    "Verification operator",
  );
  await page.getByLabel("Status", { exact: true }).selectOption("Closed");
  await page
    .getByLabel("Action taken and member’s response / outcome")
    .fill("Member accepted the proposed next step.");
  await page
    .getByRole("button", { name: "Save follow-up", exact: true })
    .click();
  await page.getByText("Follow-up saved.", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".worklist-table tbody tr").count(), 0);
  report.followupUi =
    "save, reopen, concern routing and close passed using isolated follow-up state";
  await page
    .getByRole("group", { name: "Choose a worklist" })
    .getByRole("button", { name: /^Renewals due/ })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export worklist", exact: true })
    .click();
  report.worklistExport = (await download).suggestedFilename();
  await page.getByRole("button", { name: "Switch to gloss theme" }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: "screenshots/upgrades-retention-gloss.png" });
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Schedule & capacity", exact: true })
    .click();
  await usable();
  await page.locator(".metric-value").first().click();
  await page.getByRole("dialog", { name: /Drill into/ }).waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".drill-record").length > 0,
  );
  assert.equal(
    await page
      .locator("svg")
      .evaluateAll(
        (nodes) => nodes.filter((n) => n.innerHTML.includes("NaN")).length,
      ),
    0,
  );
  await page.keyboard.press("Escape");
  // Source failure must preserve the usable snapshot and expose retry.
  await page.route("**/api/sheets/sessions?refresh=true", (r) =>
    r.fulfill({
      json: { status: "error", error: "Verification upstream failure" },
    }),
  );
  await page
    .getByRole("button", { name: "Refresh source data", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry source", exact: true })
    .first()
    .waitFor();
  await usable();
  report.failedRefreshPreservedMetrics = true;
  await page.screenshot({ path: "screenshots/upgrades-failed-refresh.png" });
  assert.equal(errors.length, 0, errors.join("\n"));
  const registry = JSON.parse(
    await readFile("src/semantics/registry.json", "utf8"),
  );
  const expr = (id) => registry.find((m) => m.id === id).expression;
  report.metricChecks = await page.evaluate(
    async ({ effective, complimentary, utilisation }) => {
      const q = window.__floorDiagnostics.query;
      const flags = await q(
        `WITH flags(attended,cancelled,late_cancelled,no_show,complimentary) AS (VALUES (TRUE,FALSE,0,FALSE,TRUE),(TRUE,TRUE,1,TRUE,FALSE),(FALSE,TRUE,1,FALSE,TRUE),(TRUE,FALSE,0,FALSE,FALSE)) SELECT ${effective} AS effective,${complimentary} AS complimentary FROM flags`,
      );
      const usage = await q(
        `WITH access(session_limit,remaining,completed) AS (VALUES (10,3,300),(10,11,1000),(NULL,NULL,500)) SELECT ${utilisation} AS utilisation FROM access`,
      );
      return { ...flags[0], ...usage[0] };
    },
    {
      effective: expr("effective_attendance"),
      complimentary: expr("complimentary_rate"),
      utilisation: expr("utilisation"),
    },
  );
  assert.equal(report.metricChecks.effective, 0.5);
  assert.ok(Math.abs(report.metricChecks.complimentary - 1 / 3) < 1e-12);
  assert.equal(report.metricChecks.utilisation, 0.7);
  const noData = await browser.newContext({ reducedMotion: "reduce" });
  const failedPage = await noData.newPage();
  await failedPage.route("**/api/sheets/**", (r) =>
    r.request().url().includes("snapshot=true")
      ? r.fulfill({ status: 404, json: { error: "No saved snapshot" } })
      : r.fulfill({
          json: { status: "error", error: "Verification source unavailable" },
        }),
  );
  await failedPage.goto(report.url);
  await failedPage
    .getByRole("button", { name: "Retry source", exact: true })
    .first()
    .waitFor({ timeout: 30000 });
  assert.equal(await failedPage.locator(".metric-card").count(), 0);
  report.noSnapshotFailure =
    "unavailable state and retry; no fabricated metrics";
  await noData.close();
  await writeFile(
    "UPGRADES-VERIFICATION.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
} catch (e) {
  await page.screenshot({ path: "screenshots/upgrades-error.png" });
  console.error(
    "Form labels:",
    await page.locator(".followup-form label").allTextContents(),
  );
  console.error(e);
  await browser.close();
  process.exitCode = 1;
}
