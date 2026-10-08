// Golden-question evaluation for the studio agent. Opt-in: it calls the live model through
// a running Atlas server, so run it deliberately (npm run eval:agent -- --url http://localhost:8787).
// Each answer must match every expected pattern; unverified figures and latency are reported.
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { url: { type: "string", default: "http://localhost:8787" }, only: { type: "string" } } });
const cases = JSON.parse(await readFile(new URL("../tests/golden/agent-questions.json", import.meta.url), "utf8"));
let passed = 0;
for (const [i, c] of cases.entries()) {
  if (values.only && !c.question.toLowerCase().includes(values.only.toLowerCase())) continue;
  const started = Date.now();
  try {
    const r = await fetch(values.url + "/api/intelligence/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: c.question, saveHistory: false, filters: {} }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    const text = [d.answer, ...(d.presentation?.highlights || []).map((h) => `${h.label} ${h.value} ${h.change || ""}`)].join("\n");
    const missing = c.expect.filter((p) => !new RegExp(p, "i").test(text));
    const ok = !missing.length;
    passed += ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${i + 1}. ${c.question}  (${((Date.now() - started) / 1000).toFixed(1)}s, ${d.activity?.length ?? 0} tool calls${d.presentation?.unverified?.length ? `, unverified: ${d.presentation.unverified.join(", ")}` : ""})`);
    if (!ok) console.log(`     missing ${missing.join(" | ")}\n     headline: ${d.presentation?.headline || d.answer.slice(0, 200)}`);
  } catch (e) {
    console.log(`ERROR ${i + 1}. ${c.question}: ${e.message}`);
  }
}
console.log(`\n${passed}/${values.only ? "selected" : cases.length} golden questions passed.`);
process.exitCode = passed === cases.length || values.only ? 0 : 1;
