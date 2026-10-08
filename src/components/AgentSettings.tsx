import { useState } from "react";
import { usePreferences } from "../state/preferences";
export function AgentSettings() {
  const { preferences: p, update } = usePreferences();
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
  return (<div className="atlas-settings agent-settings">
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
            Reasoning depth
            <select value={p.chatReasoning} onChange={(e) => update({ chatReasoning: e.target.value as "low" | "medium" | "high" })} title="Applies to reasoning models (gpt-5, o-series). Deeper is slower but more careful.">
              <option value="low">Fast</option>
              <option value="medium">Balanced</option>
              <option value="high">Thorough</option>
            </select>
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
<label>Assistant panel width<input type="range" min={360} max={900} value={p.chatWidth} onChange={(e) => update({chatWidth: Number(e.target.value)})} />{p.chatWidth}px</label>
</div>);
}
