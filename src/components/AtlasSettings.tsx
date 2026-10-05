import { useState } from "react";
import {
  usePreferences,
  themeOptions,
  sections,
  defaultPreferences,
} from "../state/preferences";
import { useStore, tabs } from "../state/store";
import { blueprints } from "../data/blueprints";
import { metrics } from "../semantics/metrics";
export function AtlasSettings() {
  const s = useStore();
  const { preferences: p, update, page: changePage } = usePreferences();
  const [tab, setTab] = useState(s.tab);
  const config = p.page[tab] || {};
  const [key, setKey] = useState("");
  const [model, setModel] = useState(p.chatModel);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function saveKey(remove = false, modelOnly = false) {
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/intelligence/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(modelOnly ? {} : { apiKey: remove ? "" : key }),
          model,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setKey("");
      update({ chatModel: model });
      setNotice(
        modelOnly
          ? "Model setting saved."
          : remove
            ? "Saved UI key removed."
            : "API key saved encrypted on the server.",
      );
      window.dispatchEvent(new Event("atlas-provider"));
    } catch (e) {
      setNotice(String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="atlas-settings">
      <details open>
        <summary>Appearance & layout</summary>
        <div className="theme-grid">
          {themeOptions.map((t) => (
            <button
              key={t.id}
              className={"theme-choice " + (s.theme === t.id ? "selected" : "")}
              data-preview-theme={t.id}
              onClick={() => s.set({ theme: t.id })}
            >
              <span className="theme-preview" />
              <strong>{t.name}</strong>
              <small>{t.type}</small>
            </button>
          ))}
        </div>
        <div className="settings-grid">
          {(
            [
              ["fontSize", "Text size", 11, 17],
              ["radius", "Corner radius", 0, 24],
              ["chartHeight", "Chart height", 220, 600],
              ["contentWidth", "Content width (0 = fluid)", 0, 2400],
              ["chatWidth", "Chat width", 360, 900],
            ] as const
          ).map(([field, label, min, max]) => (
            <label key={field}>
              {label}
              <input
                type="range"
                min={min}
                max={max}
                value={p[field]}
                onChange={(e) => update({ [field]: Number(e.target.value) })}
              />
              <span>{p[field]}px</span>
            </label>
          ))}
          <label>
            <input
              type="checkbox"
              checked={p.animation}
              onChange={(e) => update({ animation: e.target.checked })}
            />{" "}
            Enable animations
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.legend}
              onChange={(e) => update({ legend: e.target.checked })}
            />{" "}
            Chart legends
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.grid}
              onChange={(e) => update({ grid: e.target.checked })}
            />{" "}
            Chart grid lines
          </label>
        </div>
      </details>
      <details open>
        <summary>Customize pages & sections</summary>
        <label>
          Page
          <select
            aria-label="Customize page"
            value={tab}
            onChange={(e) => setTab(Number(e.target.value))}
          >
            {tabs.map((t, i) => (
              <option key={t} value={i}>
                {p.page[i]?.name || t}
              </option>
            ))}
          </select>
        </label>
        <div className="settings-grid">
          <label>
            Navigation name
            <input
              value={config.name || tabs[tab]}
              onChange={(e) => changePage(tab, { name: e.target.value })}
            />
          </label>
          <label>
            Page heading
            <input
              aria-label="Page heading"
              value={config.heading || blueprints[tab].title}
              onChange={(e) => changePage(tab, { heading: e.target.value })}
            />
          </label>
          <label>
            Page description
            <textarea
              value={config.subtitle ?? blueprints[tab].subtitle}
              onChange={(e) => changePage(tab, { subtitle: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={!config.hidden}
              onChange={(e) => changePage(tab, { hidden: !e.target.checked })}
            />{" "}
            Show in navigation
          </label>
        </div>
        <label>
          Page accent
          <input
            type="color"
            value={config.accent || "#00a9be"}
            onChange={(e) => changePage(tab, { accent: e.target.value })}
          />
        </label>
        <div className="settings-grid">
          {Object.entries({
            "01": "Register heading",
            "02": "Chart heading",
            "04": "Ranking heading",
            "05": "Weekly pattern heading",
            "06": "MoM heading",
            "07": "Secondary section heading",
          }).map(([id, label]) => (
            <label key={id}>
              {label}
              <input
                value={config.sectionTitles?.[id] || ""}
                placeholder="Use the default heading"
                onChange={(e) =>
                  changePage(tab, {
                    sectionTitles: {
                      ...config.sectionTitles,
                      [id]: e.target.value,
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
        <div className="section-options">
          {sections.map((section) => (
            <label key={section}>
              <input
                type="checkbox"
                checked={config.sections?.[section] !== false}
                onChange={(e) =>
                  changePage(tab, {
                    sections: {
                      ...config.sections,
                      [section]: e.target.checked,
                    },
                  })
                }
              />
              {section === "monthly" ? "Month-on-month tables" : section}
            </label>
          ))}
        </div>
        <details>
          <summary>Metric columns & grouping</summary>
          <p className="small">
            Choose this page's register columns. Grouping changes can also be
            made from the table.
          </p>
          <div className="section-options">
            {blueprints[tab].columns.map((id) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={(config.columns || blueprints[tab].columns).includes(
                    id,
                  )}
                  onChange={(e) => {
                    const current = config.columns || blueprints[tab].columns;
                    const next = e.target.checked
                      ? [...current, id]
                      : current.filter((c) => c !== id);
                    if (next.length) changePage(tab, { columns: next });
                  }}
                />
                {metrics[id]?.label || id}
              </label>
            ))}
          </div>
        </details>
        <button
          className="button"
          onClick={() =>
            changePage(tab, {
              name: undefined,
              heading: undefined,
              subtitle: undefined,
              hidden: false,
              sections: {},
              groups: undefined,
              columns: undefined,
            })
          }
        >
          Reset this page
        </button>
      </details>
      <details open>
        <summary>GPT & agent controls</summary>
        <p className="small">
          The API key is encrypted on this server, excluded from Git, and never
          returned to the browser. Cloud conversations and components require
          Supabase.
        </p>
        <div className="settings-grid">
          <label>
            OpenAI API key
            <input
              type="password"
              aria-label="OpenAI API key"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter a key to replace the saved key"
            />
          </label>
          <label>
            GPT model
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4.1"
            />
          </label>
          <label>
            Answer token limit
            <input
              type="number"
              min={500}
              max={8000}
              step={500}
              value={p.chatTokens}
              onChange={(e) =>
                update({
                  chatTokens: Math.max(
                    500,
                    Math.min(8000, Number(e.target.value) || 3500),
                  ),
                })
              }
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.chatEvidence}
              onChange={(e) => update({ chatEvidence: e.target.checked })}
            />{" "}
            Show query evidence
          </label>
          <label>
            <input
              type="checkbox"
              checked={p.chatSaveHistory}
              onChange={(e) => update({ chatSaveHistory: e.target.checked })}
            />{" "}
            Save conversation history
          </label>
        </div>
        <button
          className="button primary"
          disabled={saving || !key.trim()}
          onClick={() => void saveKey()}
        >
          Save API key
        </button>
        <button
          className="button"
          disabled={saving}
          onClick={() => void saveKey(false, true)}
        >
          Save model
        </button>{" "}
        <button
          className="button"
          disabled={saving}
          onClick={() => void saveKey(true)}
        >
          Remove saved API key
        </button>
        {notice && <p role="status">{notice}</p>}
      </details>
      <button
        className="button"
        onClick={() => update({ ...defaultPreferences, page: {} })}
      >
        Reset customization
      </button>
      <p className="small muted">
        Preferences save automatically in this browser and sync to Supabase when
        connected.
      </p>
    </div>
  );
}
