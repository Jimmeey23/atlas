import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.FLOOR_URL || "http://localhost:5174";
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launchPersistentContext(
  ".cache/verification-browser",
  {
    headless: true,
    args: ["--enable-precise-memory-info", "--remote-debugging-port=9223"],
    viewport: { width: 1600, height: 1000 },
    reducedMotion: "reduce",
  },
);
const page = await browser.newPage();
page.setDefaultTimeout(240000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const start = performance.now();
const ticker = setInterval(async () => {
  try {
    console.log(
      "Browser status:",
      await page.locator(".statusbar").innerText({ timeout: 2000 }),
    );
  } catch {}
}, 15000);
await page.goto(base);
await page.waitForFunction(
  () =>
    !!document.querySelector(".metric-value") &&
    document.querySelector(".metric-value").textContent !== "—",
  undefined,
  { timeout: 240000 },
);
await page.locator('main[aria-busy="false"]').waitFor({ timeout: 240000 });
clearInterval(ticker);
const coldInteractive = performance.now() - start;
const result = {
  url: base,
  coldInteractiveMs: Math.round(coldInteractive),
  tabs: [],
  errors,
  screenshots: [],
  memory: await page.evaluate(() =>
    performance.memory
      ? {
          usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
          totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
        }
      : null,
  ),
  paint: await page.evaluate(() =>
    performance
      .getEntriesByType("paint")
      .map((e) => ({ name: e.name, ms: Math.round(e.startTime) })),
  ),
};
console.log("Loaded real sources in", result.coldInteractiveMs, "ms");
const tabs = [
  "Business overview",
  "Studio experiences",
  "Schedule & capacity",
  "Instructor performance",
  "Revenue & sales",
  "Member acquisition",
  "Renewals & retention",
  "Booking behaviour",
  "Enquiries & conversion",
  "Member attendance",
  "Instructor economics",
  "Data quality",
];
for (const theme of ["matte", "gloss"]) {
  if (
    (await page.evaluate(() => document.documentElement.dataset.theme)) !==
    theme
  )
    await page
      .getByRole("button", { name: `Switch to ${theme} theme` })
      .click();
  for (const width of [1600, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [i, tab] of tabs.entries()) {
      const t = performance.now();
      await page
        .getByRole("navigation")
        .getByRole("button", { name: tab, exact: i !== 11 })
        .click();
      try {
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        await page.waitForFunction(
          (index) => {
            const sources = [
              ["sessions", "new"],
              ["sessions"],
              ["sessions"],
              ["sessions"],
              ["sales"],
              ["new"],
              ["lapsed", "new", "checkins"],
              ["bookings"],
              ["leads"],
              ["checkins"],
              ["payroll"],
              [
                "sessions",
                "new",
                "sales",
                "lapsed",
                "checkins",
                "bookings",
                "leads",
                "payroll",
                "recurring",
                "teacher_recurring",
              ],
            ];
            const health = window.__floorDiagnostics?.health;
            return (
              sources[index].every((k) => health?.[k]?.fetchedAt) &&
              (index === 11
                ? !!document.querySelector(".health-cards")
                : document.querySelectorAll(".metric-value").length > 0)
            );
          },
          i,
          { timeout: 120000 },
        );
        await page
          .locator('main[aria-busy="false"]')
          .waitFor({ timeout: 30000 });
      } catch (e) {
        await page.screenshot({ path: "screenshots/error-state.png" });
        console.log(
          "Failed tab",
          tab,
          await page.locator(".notice").allTextContents(),
          await page.evaluate(() => ({
            pending: window.__floorDiagnostics
              ? [...window.__floorDiagnostics.pendingQueries.values()]
              : [],
            memory: performance.memory?.usedJSHeapSize,
          })),
        );
        throw e;
      }
      const ms = performance.now() - t;
      await page.waitForTimeout(250);
      const notices = await page.locator(".notice").allTextContents();
      const values = await page.locator(".metric-value").allTextContents();
      const file = `screenshots/${String(i).padStart(2, "0")}-${tab.toLowerCase().replaceAll(" ", "-")}-${theme}-${width}.png`;
      await page.screenshot({ path: file });
      result.screenshots.push(file);
      result.tabs.push({
        tab,
        theme,
        width,
        interactionMs: Math.round(ms),
        values,
        notices,
      });
      console.log(
        theme,
        width,
        tab,
        Math.round(ms) + "ms",
        notices.filter((n) => /Error|Exception|Binder|Parser/.test(n)).join(""),
      );
    }
  }
}
result.calculationChecks = await page.evaluate(async () => {
  const { query } = window.__floorDiagnostics;
  const r = await query(
    "SELECT SUM(checked_in)/NULLIF(SUM(capacity),0) AS weighted_fill,AVG(checked_in/NULLIF(capacity,0)) AS average_of_rates,SUM(revenue) AS revenue,COUNT(*) AS sessions FROM sessions WHERE date BETWEEN '2026-09-01' AND '2026-09-30'",
  );
  const source = await query(
    "SELECT COUNT(*) AS imports, SUM(revenue) AS imported_revenue FROM bookings WHERE imported",
  );
  return { september: r[0], imports: source[0] };
});
await writeFile("PERFORMANCE.json", JSON.stringify(result, null, 2));
// Exercise the brief's concrete operator journey with real data.
await page
  .getByRole("navigation")
  .getByRole("button", { name: "Schedule & capacity", exact: true })
  .click();
await page.locator('main[aria-busy="false"]').waitFor();
await page.getByRole("button", { name: "Filters", exact: true }).click();
await page.getByLabel("Period preset").selectOption("quarter");
await page.locator(".multi").filter({ hasText: "Location" }).count();
await page
  .locator(".drawer")
  .getByText("All locations", { exact: false })
  .first()
  .click();
await page
  .locator(".drawer")
  .getByRole("checkbox", { name: /Kwality House/ })
  .check();
await page.getByRole("button", { name: "Done", exact: true }).click();
await page.locator('main[aria-busy="false"]').waitFor();
await page
  .getByRole("columnheader", { name: "Fill rate" })
  .getByRole("button")
  .click();
const expansion = page.getByRole("button", { name: /Expand Kwality/ }).first();
if (await expansion.count()) {
  const t = performance.now();
  await expansion.click();
  result.expandMs = Math.round(performance.now() - t);
}
const row = page.locator("tbody tr.level-1").first();
if (await row.count()) {
  await row.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: /Drill into/ }).waitFor();
  await page.waitForTimeout(250);
  result.drillRecords = await page.locator(".drill-record").count();
  await page.keyboard.press("Escape");
}
await page.screenshot({ path: "screenshots/operator-journey.png" });
result.memoryAfterTabs = await page.evaluate(() =>
  performance.memory
    ? {
        usedMB: Math.round(performance.memory.usedJSHeapSize / 1048576),
        totalMB: Math.round(performance.memory.totalJSHeapSize / 1048576),
      }
    : null,
);
result.errors = errors;
await writeFile("PERFORMANCE.json", JSON.stringify(result, null, 2));
await browser.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
}
