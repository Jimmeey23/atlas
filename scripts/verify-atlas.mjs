import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launchPersistentContext(
  ".cache/atlas-browser-check",
  {
    headless: true,
    viewport: { width: 1600, height: 1100 },
    reducedMotion: "reduce",
  },
);
const page = await browser.newPage();
page.setDefaultTimeout(120000);
// Keep UI fixtures out of the live cloud workspace.
await page.route("**/api/intelligence/documents**", async (route) => {
  const request = route.request();
  const body = request.method() === "POST"
    ? { ...request.postDataJSON(), id: "00000000-0000-4000-8000-000000000099" }
    : [];
  await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("Failed to load resource"))
    errors.push(m.text());
});
const report = { errors };
await mkdir("screenshots", { recursive: true });
const base = "http://localhost:5174";
try {
  await page.goto(base);
  await page.locator('main[aria-busy="false"]').waitFor();
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".metric-value")
          ?.textContent?.replaceAll(",", "")
          .replace(/[₹L]/g, ""),
      ) > 0,
  );
  assert.ok((await page.title()).startsWith("Atlas"));
  const defaultButton = page.getByRole("button", { name: "Last month", exact: true });
  assert.ok((await defaultButton.getAttribute("class"))?.includes("selected"));
  await defaultButton.click();
  let filters = JSON.parse(new URL(page.url()).searchParams.get("f"));
  assert.equal(filters.from, "2026-09-01");
  assert.equal(filters.to, "2026-09-30");
  report.defaultPeriod = filters;
  report.themes = [];
  for (const theme of [
    "matte",
    "gloss",
    "midnight",
    "obsidian",
    "dark-glass",
    "ivory",
    "porcelain",
    "light-glass",
  ]) {
    await page.getByLabel("Theme", { exact: true }).selectOption(theme);
    await page.waitForFunction(
      (t) => document.documentElement.dataset.theme === t,
      theme,
    );
    await page.screenshot({ path: `screenshots/atlas-${theme}.png` });
    report.themes.push(theme);
  }
  await page.getByLabel("Theme", { exact: true }).selectOption("matte");
  await page
    .getByRole("button", { name: /^Definition of/ })
    .first()
    .click();
  const popover = page.locator(".metric-popover-scrim .metric-info");
  await popover.waitFor();
  const bounds = await popover.boundingBox();
  assert.ok(
    bounds &&
      bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= 1600 &&
      bounds.y + bounds.height <= 1100,
  );
  assert.equal(
    await popover.evaluate((e) => !!e.closest(".metric-card")),
    false,
  );
  await page
    .getByRole("button", { name: "Close definition", exact: true })
    .click();
  report.tooltips = "Viewport-contained portal";
  await page.getByRole("button", { name: "This week", exact: true }).click();
  filters = JSON.parse(new URL(page.url()).searchParams.get("f"));
  assert.equal(filters.from, "2026-10-05");
  await page.getByRole("button", { name: "Last week", exact: true }).click();
  filters = JSON.parse(new URL(page.url()).searchParams.get("f"));
  assert.equal(filters.from, "2026-09-28");
  assert.equal(filters.to, "2026-10-04");
  await page.getByRole("button", { name: "Last month", exact: true }).click();
  await page.getByRole("button", { name: "Kemps Corner", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Renewals & retention", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Renewals by expiry month", exact: true })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll(".renewal-cohorts tbody tr").length > 1,
  );
  assert.ok(
    (await page.locator(".renewal-cohorts").innerText()).includes(
      "14 completed months",
    ),
  );
  const values = await page
    .locator(".renewal-cohorts tbody tr")
    .allInnerTexts();
  for (const row of values) {
    const v = row.split("\t");
    assert.equal(
      Number(v[1]),
      v.slice(2, 6).reduce((s, n) => s + Number(n), 0),
    );
  }
  report.renewalCohorts = values.length;
  filters = JSON.parse(new URL(page.url()).searchParams.get("f"));
  assert.deepEqual(filters.location, ["Kwality House, Kemps Corner"]);
  assert.equal(filters.from, "2026-09-01");
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await page.waitForTimeout(500);
  assert.deepEqual(
    await page.locator(".renewal-cohorts tbody tr").allInnerTexts(),
    values,
  );
  report.globalFilters = "Preserved across tabs; MoM ignores dates";
  await page.getByRole("button", { name: "Last month", exact: true }).click();
  await page.getByRole("button", { name: "All studios", exact: true }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Late cancellations", exact: true })
    .click();
  await page.locator('main[aria-busy="false"]').waitFor();
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".metric-value")
          ?.textContent?.replaceAll(",", ""),
      ) > 0,
  );
  await page.waitForFunction(async () => {
    const f = JSON.parse(new URLSearchParams(location.search).get("f"));
    if (f.from !== "2026-09-01" || f.to !== "2026-09-30" || f.location.length)
      return false;
    const rows = await window.__floorDiagnostics.query(
      "SELECT COUNT(*) AS n FROM bookings WHERE late_cancelled>0 AND date>='2026-09-01' AND date<='2026-09-30' AND NOT imported",
    );
    return (
      Number(
        document
          .querySelector(".metric-value")
          ?.textContent?.replaceAll(",", ""),
      ) === rows[0].n
    );
  });
  const expected = await page.evaluate(
    async () =>
      (
        await window.__floorDiagnostics.query(
          "SELECT COUNT(*) AS n FROM bookings WHERE late_cancelled>0 AND date>='2026-09-01' AND date<='2026-09-30' AND NOT imported",
        )
      )[0].n,
  );
  await page.waitForFunction(
    (expected) =>
      Number(
        document
          .querySelector(".metric-value")
          ?.textContent?.replaceAll(",", ""),
      ) === expected,
    expected,
  );
  assert.equal(
    Number(
      (await page.locator(".metric-value").first().innerText()).replaceAll(
        ",",
        "",
      ),
    ),
    expected,
  );
  report.lateCancellations = expected;
  await page.screenshot({ path: "screenshots/atlas-late-cancellations.png" });
  assert.ok(
    (await page.getByRole("button", { name: /^Data table for / }).count()) > 0,
  );
  await page
    .getByRole("button", { name: /^Data table for / })
    .first()
    .click();
  await page.locator(".chart-data-preview").first().waitFor();
  report.chartControls = "Interactive data table opened";
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "settings", exact: true }).waitFor();
  assert.equal(await page.locator(".theme-choice").count(), 8);
  await page.getByLabel("Customize page", { exact: true }).selectOption("12");
  await page
    .getByLabel("Page heading", { exact: true })
    .fill("Late cancellation intelligence");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Late cancellation intelligence",
      exact: true,
    })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", {
      name: "Late cancellation intelligence",
      exact: true,
    })
    .waitFor();
  report.settings = "Page customization survived reload";
  await page.getByRole("button", { name: "Ask GPT", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Atlas GPT assistant", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Agent settings", exact: true })
    .click();
  await page
    .locator(".atlas-floating-chat")
    .getByLabel("OpenAI API key", { exact: true })
    .waitFor();
  report.chat = "Floating assistant and advanced settings opened";
  await page.screenshot({ path: "screenshots/atlas-floating-assistant.png" });
  await page
    .getByRole("button", { name: "Close GPT assistant", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "screenshots/atlas-mobile.png" });
  assert.ok(
    await page
      .getByRole("button", { name: "Ask GPT", exact: true })
      .isVisible(),
  );
  assert.deepEqual(errors, []);
  await writeFile("ATLAS-VERIFICATION.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
