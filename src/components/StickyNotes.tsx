import { noteRequest } from "../data/noteApi";
import { elementSelector, type NoteConnector } from "../data/noteConnectors";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  StickyNote,
  Grip,
  X,
  Minus,
  Plus,
  Check,
  Cloud,
  RotateCcw,
  ArrowUpRight,
  Minus as LineIcon,
  Pin,
  PinOff,
  Copy,
  MoreHorizontal,
  CheckCircle2,
  Maximize2,
  Unlink,
} from "lucide-react";
import { useStore } from "../state/store";
type Note = {
  id: string;
  tab: number;
  view: string;
  x: number;
  y: number;
  text: string;
  color: string;
  collapsed: boolean;
  title?: string;
  pinned?: boolean;
  resolved?: boolean;
  width?: number;
  height?: number;
  fontSize?: number;
  priority?: string;
  connections?: NoteConnector[];
  author?: string;
  createdAt?: string;
};
// Who is posting, remembered on this device only. The key is deliberately outside the
// cloud-synced preference keys, so one person's name never overwrites another's.
const AUTHOR_KEY = "p57-note-author";
const readAuthor = () => {
  try { return localStorage.getItem(AUTHOR_KEY)?.trim() || ""; } catch { return ""; }
};
function askAuthor(): string {
  const known = readAuthor();
  if (known) return known;
  const name = window.prompt("Your name — shown on every note you post")?.trim().slice(0, 60) || "";
  if (name) try { localStorage.setItem(AUTHOR_KEY, name); } catch { /* private mode: name applies to this note only */ }
  return name;
}
type SaveState = "saving" | "saved" | "error";
const DRAFTS = "atlas-sticky-note-drafts";
const colors = ["lemon", "rose", "mint", "sky"];
export function StickyNotes() {
  const tab = useStore((s) => s.tab),
    view = useStore((s) => s.view) === "kra" ? "kra" : "performance";
  const [canvas, setCanvas] = useState<HTMLElement | null>(null),
    [placing, setPlacing] = useState(false),
    [notes, setNotes] = useState<Note[]>([]),
    [status, setStatus] = useState<Record<string, SaveState>>({}),
    [error, setError] = useState("");
  const author = useRef(readAuthor());
  const [connecting, setConnecting] = useState<{
    id: string;
    type: "arrow" | "line";
  } | null>(null);
  const [paths, setPaths] = useState<
    { id: string; d: string; type: string; color: string }[]
  >([]);
  const current = useRef<Note[]>([]),
    timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({}),
    queues = useRef<Record<string, Promise<void>>>({});
  const mounted = useRef(true);
  function replace(next: Note[]) {
    current.current = next;
    setNotes(next);
  }
  function draft(note: Note | null, id: string) {
    try {
      const pending: Record<string, Note> = JSON.parse(
        localStorage.getItem(DRAFTS) || "{}",
      );
      if (note) pending[id] = note;
      else delete pending[id];
      localStorage.setItem(DRAFTS, JSON.stringify(pending));
    } catch {}
  }
  const request = noteRequest;
  function save(note: Note) {
    draft(note, note.id);
    setStatus((s) => ({ ...s, [note.id]: "saving" }));
    queues.current[note.id] = (queues.current[note.id] ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        try {
          await request(`/api/sticky-notes/${note.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(note),
          });
          if (
            JSON.stringify(current.current.find((n) => n.id === note.id)) ===
            JSON.stringify(note)
          ) {
            draft(null, note.id);
            if (mounted.current)
              setStatus((s) => ({ ...s, [note.id]: "saved" }));
          }
          if (mounted.current) setError("");
        } catch (e) {
          if (mounted.current) {
            setStatus((s) => ({ ...s, [note.id]: "error" }));
            setError(String(e instanceof Error ? e.message : e));
          }
        }
      });
  }
  function update(id: string, patch: Partial<Note>) {
    const next = current.current.map((n) =>
      n.id === id ? { ...n, ...patch } : n,
    );
    replace(next);
    const note = next.find((n) => n.id === id);
    if (!note) return;
    draft(note, id);
    setStatus((s) => ({ ...s, [id]: "saving" }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => {
      delete timers.current[id];
      save(note);
    }, 500);
  }
  async function remove(id: string) {
    clearTimeout(timers.current[id]);
    await queues.current[id];
    try {
      await request(`/api/sticky-notes/${id}`, { method: "DELETE" });
      draft(null, id);
      replace(current.current.filter((n) => n.id !== id));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setStatus((s) => ({ ...s, [id]: "error" }));
    }
  }
  useEffect(() => {
    mounted.current = true;
    setCanvas(document.getElementById("main"));
    const controller = new AbortController();
    let drafts: Note[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFTS) || "{}");
      drafts = Array.isArray(saved) ? [] : Object.values(saved);
    } catch {}
    request("/api/sticky-notes", { signal: controller.signal })
      .then((body) => {
        if (mounted.current) {
          // Notes placed or edited while the initial read is in flight win over that read.
          const local = new Map(
            [...drafts, ...current.current].map((note) => [note.id, note]),
          );
          const merged = [
            ...body.notes.filter((n: Note) => !local.has(n.id)),
            ...local.values(),
          ];
          replace(merged);
          setStatus(
            Object.fromEntries(body.notes.map((n: Note) => [n.id, "saved"])),
          );
          drafts.forEach(save);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          replace([
            ...new Map(
              [...drafts, ...current.current].map((note) => [note.id, note]),
            ).values(),
          ]);
          setStatus(Object.fromEntries(drafts.map((n) => [n.id, "error"])));
          setError(String(e instanceof Error ? e.message : e));
        }
      });
    return () => {
      mounted.current = false;
      controller.abort();
      Object.entries(timers.current).forEach(([id, timer]) => {
        clearTimeout(timer);
        const note = current.current.find((n) => n.id === id);
        if (note) save(note);
      });
    };
  }, []);
  useEffect(() => {
    if (!canvas || !placing) return;
    canvas.classList.add("placing-sticky-note");
    const place = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const note: Note = {
        id: crypto.randomUUID(),
        tab,
        view,
        x: Math.max(
          0,
          Math.min(
            1,
            (event.clientX - rect.left - 12) /
              Math.max(1, canvas.clientWidth - 252),
          ),
        ),
        y: Math.max(0, event.clientY - rect.top + canvas.scrollTop - 12),
        text: "",
        color: "lemon",
        collapsed: false,
        author: author.current || undefined,
        createdAt: new Date().toISOString(),
      };
      replace([...current.current, note]);
      save(note);
      setPlacing(false);
      setTimeout(() => document.getElementById(`note-${note.id}`)?.focus(), 0);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPlacing(false);
    };
    canvas.addEventListener("click", place, true);
    window.addEventListener("keydown", escape);
    return () => {
      canvas.classList.remove("placing-sticky-note");
      canvas.removeEventListener("click", place, true);
      window.removeEventListener("keydown", escape);
    };
  }, [canvas, placing, tab, view]);
  useEffect(() => {
    setPlacing(false);
    setConnecting(null);
  }, [tab, view]);
  useEffect(() => {
    if (!canvas || !connecting) return;
    canvas.classList.add("connecting-sticky-note");
    let highlighted: HTMLElement | null = null;
    const hover = (event: PointerEvent) => {
      highlighted?.classList.remove("note-connection-target");
      const target = event.target as HTMLElement;
      highlighted = target.closest(".sticky-note-layer")
        ? null
        : (target.closest<HTMLElement>("[data-note-anchor],.register") ??
          target);
      highlighted?.classList.add("note-connection-target");
    };
    const attach = (event: MouseEvent) => {
      const clicked = event.target as HTMLElement;
      if (clicked.closest(".sticky-note-layer")) return;
      event.preventDefault();
      event.stopPropagation();
      const selector = elementSelector(clicked, canvas);
      const target = canvas.querySelector<HTMLElement>(selector);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const note = current.current.find((n) => n.id === connecting.id);
      if (!note) return;
      if ((note.connections?.length ?? 0) >= 20) {
        setError("A note supports up to 20 connections.");
        setConnecting(null);
        return;
      }
      update(note.id, {
        connections: [
          ...(note.connections ?? []),
          {
            id: crypto.randomUUID(),
            type: connecting.type,
            target: {
              selector,
              x: Math.max(
                0,
                Math.min(
                  1,
                  (event.clientX - rect.left) / Math.max(1, rect.width),
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  1,
                  (event.clientY - rect.top) / Math.max(1, rect.height),
                ),
              ),
              label: (
                target.querySelector("h2,h3,.metric-label")?.textContent ||
                clicked.textContent ||
                clicked.getAttribute("aria-label") ||
                "Workspace element"
              )
                .trim()
                .slice(0, 160),
            },
          },
        ],
      });
      setConnecting(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnecting(null);
    };
    canvas.addEventListener("pointermove", hover);
    canvas.addEventListener("click", attach, true);
    window.addEventListener("keydown", escape);
    return () => {
      highlighted?.classList.remove("note-connection-target");
      canvas.classList.remove("connecting-sticky-note");
      canvas.removeEventListener("pointermove", hover);
      canvas.removeEventListener("click", attach, true);
      window.removeEventListener("keydown", escape);
    };
  }, [canvas, connecting]);
  useEffect(() => {
    if (!canvas) return;
    if (
      !notes.some(
        (n) => n.tab === tab && n.view === view && n.connections?.length,
      )
    ) {
      setPaths((old) => (old.length ? [] : old));
      return;
    }
    const measure = () => {
      const bounds = canvas.getBoundingClientRect(),
        next: typeof paths = [];
      for (const note of notes.filter(
        (n) => n.tab === tab && n.view === view,
      )) {
        const card = canvas.querySelector<HTMLElement>(
          `[data-note-id="${note.id}"]`,
        );
        if (!card) continue;
        const r = card.getBoundingClientRect();
        for (const link of note.connections ?? []) {
          let target: HTMLElement | null = null;
          try {
            target = canvas.querySelector(link.target.selector);
          } catch {}
          if (!target || !target.getClientRects().length) continue;
          const end = target.getBoundingClientRect();
          const tx =
              end.left +
              end.width * link.target.x -
              bounds.left +
              canvas.scrollLeft,
            ty =
              end.top +
              end.height * link.target.y -
              bounds.top +
              canvas.scrollTop;
          const cx = r.left + r.width / 2 - bounds.left + canvas.scrollLeft,
            cy = r.top + r.height / 2 - bounds.top + canvas.scrollTop;
          const dx = tx - cx,
            dy = ty - cy,
            ratio = Math.min(
              Math.abs(r.width / 2 / (dx || 0.01)),
              Math.abs(r.height / 2 / (dy || 0.01)),
            );
          const sx = cx + dx * ratio,
            sy = cy + dy * ratio;
          next.push({
            id: link.id,
            type: link.type,
            d: `M ${sx} ${sy} L ${tx} ${ty}`,
            color:
              note.color === "rose"
                ? "#b74768"
                : note.color === "mint"
                  ? "#32805c"
                  : note.color === "sky"
                    ? "#3277b6"
                    : "#a97913",
          });
        }
      }
      setPaths((old) =>
        JSON.stringify(old) === JSON.stringify(next) ? old : next,
      );
    };
    measure();
    const timer = setInterval(measure, 400);
    window.addEventListener("resize", measure);
    return () => {
      clearInterval(timer);
      window.removeEventListener("resize", measure);
    };
  }, [canvas, notes, tab, view]);
  function duplicate(note: Note) {
    const copy = {
      ...note,
      id: crypto.randomUUID(),
      x: Math.min(1, note.x + 0.03),
      y: note.y + 35,
      pinned: false,
      connections: [],
      author: askAuthor() || undefined,
      createdAt: new Date().toISOString(),
    };
    replace([...current.current, copy]);
    save(copy);
  }

  return (
    <>
      <button
        className={`button sticky-note-trigger${placing ? " active" : ""}`}
        aria-pressed={placing}
        aria-label={placing ? "Click to place note" : "Add note"}
        title={error || "Add a movable note saved to Supabase"}
        onClick={() => {
          setConnecting(null);
          if (!placing) author.current = askAuthor();
          setPlacing(!placing);
        }}
      >
        <StickyNote size={13} />
        <span>{placing ? "Click to place" : "Add note"}</span>
      </button>
      {canvas &&
        createPortal(
          <div className="sticky-note-layer">
            <svg
              className="note-connector-layer"
              width={canvas.scrollWidth}
              height={canvas.scrollHeight}
              aria-label="Note connectors"
            >
              <defs>
                <marker
                  id="note-arrow-tip"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
                </marker>
              </defs>
              {paths.map((path) => (
                <path
                  key={path.id}
                  data-connector-id={path.id}
                  d={path.d}
                  fill="none"
                  stroke={path.color}
                  strokeWidth="2"
                  markerEnd={
                    path.type === "arrow" ? "url(#note-arrow-tip)" : undefined
                  }
                />
              ))}
            </svg>
            {connecting && (
              <div className="sticky-placement-hint" role="status">
                Click the element to connect{" "}
                {connecting.type === "arrow" ? "an arrow" : "a line"} · Esc to
                cancel
              </div>
            )}
            {placing && (
              <div className="sticky-placement-hint" role="status">
                Click anywhere in this workspace to place a note · Esc to cancel
              </div>
            )}
            {notes
              .filter((n) => n.tab === tab && n.view === view)
              .map((note) => (
                <article
                  key={note.id}
                  data-note-id={note.id}
                  className={`sticky-note ${note.color}${note.collapsed ? " collapsed" : ""}${note.pinned ? " pinned" : ""}${note.resolved ? " resolved" : ""}`}
                  style={{
                    left: `calc(${note.x} * (100% - ${(note.width ?? 240) + 12}px))`,
                    width: note.width ?? 240,
                    top: note.y,
                  }}
                  aria-label="Sticky note"
                >
                  <header>
                    <button
                      className="note-grip"
                      aria-label="Move note; use arrow keys to adjust position"
                      onKeyDown={(e) => {
                        if (note.pinned) return;
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                          ].includes(e.key)
                        ) {
                          e.preventDefault();
                          update(note.id, {
                            x: Math.max(
                              0,
                              Math.min(
                                1,
                                note.x +
                                  (e.key === "ArrowLeft"
                                    ? -10
                                    : e.key === "ArrowRight"
                                      ? 10
                                      : 0) /
                                    Math.max(
                                      1,
                                      canvas.clientWidth -
                                        (note.width ?? 240) -
                                        12,
                                    ),
                              ),
                            ),
                            y: Math.max(
                              0,
                              note.y +
                                (e.key === "ArrowUp"
                                  ? -10
                                  : e.key === "ArrowDown"
                                    ? 10
                                    : 0),
                            ),
                          });
                        }
                      }}
                      onPointerDown={(e) => {
                        if (note.pinned) return;
                        const target = e.currentTarget,
                          startX = e.clientX,
                          startY = e.clientY;
                        target.setPointerCapture(e.pointerId);
                        const move = (event: PointerEvent) =>
                          update(note.id, {
                            x: Math.max(
                              0,
                              Math.min(
                                1,
                                note.x +
                                  (event.clientX - startX) /
                                    Math.max(
                                      1,
                                      canvas.clientWidth -
                                        (note.width ?? 240) -
                                        12,
                                    ),
                              ),
                            ),
                            y: Math.max(0, note.y + event.clientY - startY),
                          });
                        const end = () => {
                          target.removeEventListener("pointermove", move);
                          target.removeEventListener("pointerup", end);
                          target.removeEventListener("pointercancel", end);
                        };
                        target.addEventListener("pointermove", move);
                        target.addEventListener("pointerup", end);
                        target.addEventListener("pointercancel", end);
                      }}
                    >
                      <Grip size={14} />
                      <span>
                        {note.title ||
                          (note.collapsed ? note.text.slice(0, 22) : "") ||
                          "Studio note"}
                      </span>
                    </button>
                    <button
                      aria-label={note.pinned ? "Unpin note" : "Pin note"}
                      aria-pressed={!!note.pinned}
                      onClick={() => update(note.id, { pinned: !note.pinned })}
                    >
                      {note.pinned ? <Pin size={12} /> : <PinOff size={12} />}
                    </button>
                    <details className="note-options">
                      <summary aria-label="Note options">
                        <MoreHorizontal size={14} />
                      </summary>
                      <div className="note-options-menu">
                        <label>
                          Title
                          <input
                            aria-label="Note title"
                            maxLength={120}
                            value={note.title ?? ""}
                            onChange={(e) =>
                              update(note.id, { title: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Priority
                          <select
                            aria-label="Note priority"
                            value={note.priority ?? "normal"}
                            onChange={(e) =>
                              update(note.id, { priority: e.target.value })
                            }
                          >
                            <option value="normal">Normal</option>
                            <option value="important">Important</option>
                            <option value="urgent">Urgent</option>
                          </select>
                        </label>
                        <label>
                          Text size
                          <select
                            aria-label="Note text size"
                            value={note.fontSize ?? 12}
                            onChange={(e) =>
                              update(note.id, {
                                fontSize: Number(e.target.value),
                              })
                            }
                          >
                            {[10, 12, 14, 16, 18, 20].map((size) => (
                              <option key={size} value={size}>
                                {size}px
                              </option>
                            ))}
                          </select>
                        </label>
                        <button onClick={() => duplicate(note)}>
                          <Copy size={12} />
                          Duplicate note
                        </button>
                        <button
                          onClick={() =>
                            update(note.id, { resolved: !note.resolved })
                          }
                        >
                          <CheckCircle2 size={12} />
                          {note.resolved ? "Reopen note" : "Mark done"}
                        </button>
                        <button
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            setPlacing(false);
                            setConnecting({ id: note.id, type: "arrow" });
                          }}
                        >
                          <ArrowUpRight size={12} />
                          Connect arrow
                        </button>
                        <button
                          onClick={(event) => {
                            event.currentTarget
                              .closest("details")
                              ?.removeAttribute("open");
                            setPlacing(false);
                            setConnecting({ id: note.id, type: "line" });
                          }}
                        >
                          <LineIcon size={12} />
                          Connect line
                        </button>
                        {(note.connections ?? []).map((link) => (
                          <div className="note-link-row" key={link.id}>
                            <span title={link.target.label}>
                              {link.type} · {link.target.label || "Element"}
                            </span>
                            <button
                              aria-label={`Remove ${link.type} connection`}
                              onClick={() =>
                                update(note.id, {
                                  connections: note.connections?.filter(
                                    (c) => c.id !== link.id,
                                  ),
                                })
                              }
                            >
                              <Unlink size={12} />
                            </button>
                          </div>
                        ))}
                        {!!note.connections?.length && (
                          <button
                            onClick={() => update(note.id, { connections: [] })}
                          >
                            <Unlink size={12} />
                            Clear connections
                          </button>
                        )}
                      </div>
                    </details>
                    <button
                      aria-label={
                        note.collapsed ? "Expand note" : "Minimize note"
                      }
                      onClick={() =>
                        update(note.id, { collapsed: !note.collapsed })
                      }
                    >
                      {note.collapsed ? (
                        <Plus size={13} />
                      ) : (
                        <Minus size={13} />
                      )}
                    </button>
                    <button
                      aria-label="Delete note"
                      onClick={() => void remove(note.id)}
                    >
                      <X size={13} />
                    </button>
                  </header>
                  <p className="note-byline" title={note.createdAt ? new Date(note.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : undefined}>
                    Posted by <strong>{note.author || "Unknown author"}</strong>
                    {note.createdAt && <> · {new Date(note.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}</>}
                  </p>
                  {!note.collapsed && (
                    <>
                      <textarea
                        id={`note-${note.id}`}
                        aria-label="Note text"
                        placeholder="Capture a thought, decision or follow-up…"
                        maxLength={4000}
                        style={{
                          height: note.height ?? 125,
                          fontSize: note.fontSize ?? 12,
                          resize: "none",
                        }}
                        value={note.text}
                        onChange={(e) =>
                          update(note.id, { text: e.target.value })
                        }
                      />
                      <div className="note-meta">
                        {note.priority && note.priority !== "normal" && (
                          <span>{note.priority}</span>
                        )}
                        {note.resolved && <span>Done</span>}
                        {!!note.connections?.length && (
                          <span>{note.connections.length} connected</span>
                        )}
                      </div>
                      <footer>
                        <div className="note-colors">
                          {colors.map((color) => (
                            <button
                              key={color}
                              className={color}
                              aria-label={`${color} note`}
                              aria-pressed={note.color === color}
                              onClick={() => update(note.id, { color })}
                            />
                          ))}
                        </div>
                        <span className="note-save" role="status">
                          {status[note.id] === "saved" ? (
                            <>
                              <Check size={11} />
                              Saved
                            </>
                          ) : status[note.id] === "error" ? (
                            <button title={error} onClick={() => save(note)}>
                              <RotateCcw size={11} />
                              Retry save
                            </button>
                          ) : (
                            <>
                              <Cloud size={11} />
                              Saving…
                            </>
                          )}
                        </span>
                      </footer>
                    </>
                  )}
                  {!note.collapsed && !note.pinned && (
                    <button
                      className="note-resize"
                      aria-label="Resize note"
                      onKeyDown={(e) => {
                        if (
                          [
                            "ArrowLeft",
                            "ArrowRight",
                            "ArrowUp",
                            "ArrowDown",
                          ].includes(e.key)
                        ) {
                          e.preventDefault();
                          update(note.id, {
                            width: Math.max(
                              200,
                              Math.min(
                                480,
                                (note.width ?? 240) +
                                  (e.key === "ArrowRight"
                                    ? 10
                                    : e.key === "ArrowLeft"
                                      ? -10
                                      : 0),
                              ),
                            ),
                            height: Math.max(
                              90,
                              Math.min(
                                500,
                                (note.height ?? 125) +
                                  (e.key === "ArrowDown"
                                    ? 10
                                    : e.key === "ArrowUp"
                                      ? -10
                                      : 0),
                              ),
                            ),
                          });
                        }
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        const target = e.currentTarget,
                          sx = e.clientX,
                          sy = e.clientY;
                        target.setPointerCapture(e.pointerId);
                        const move = (ev: PointerEvent) =>
                          update(note.id, {
                            width: Math.max(
                              200,
                              Math.min(
                                480,
                                (note.width ?? 240) + ev.clientX - sx,
                              ),
                            ),
                            height: Math.max(
                              90,
                              Math.min(
                                500,
                                (note.height ?? 125) + ev.clientY - sy,
                              ),
                            ),
                          });
                        const end = () => {
                          target.removeEventListener("pointermove", move);
                          target.removeEventListener("pointerup", end);
                          target.removeEventListener("pointercancel", end);
                        };
                        target.addEventListener("pointermove", move);
                        target.addEventListener("pointerup", end);
                        target.addEventListener("pointercancel", end);
                      }}
                    >
                      <Maximize2 size={10} />
                    </button>
                  )}
                  {status[note.id] === "error" && !note.collapsed && (
                    <p className="note-error">
                      {error ||
                        "Save failed. Your draft remains on this device."}
                    </p>
                  )}
                </article>
              ))}
          </div>,
          canvas,
        )}
    </>
  );
}
