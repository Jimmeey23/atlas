import { adminStatus, unlockAdmin, lockAdmin } from "../report/storage";
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LockKeyhole, Pencil, X } from 'lucide-react';
import { workspaceElements, type ElementOverride } from '../state/workspaceLayout';

type EditableElement = HTMLElement | SVGElement;

export function elementPath(element: EditableElement, root: HTMLElement): string {
  const parts: string[] = [];
  let node: Element | null = element;
  while (node && node !== root) {
    if (node.id) { parts.unshift('#' + CSS.escape(node.id)); break; }
    const anchor = node.getAttribute('data-note-anchor');
    if (anchor) { parts.unshift(`[data-note-anchor="${CSS.escape(anchor)}"]`); break; }
    const tag = node.tagName.toLowerCase();
    const siblings = [...node.parentElement!.children].filter(el => el.tagName === node!.tagName);
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    node = node.parentElement;
  }
  return parts.join(' > ') || ':scope';
}
const normalizedStyles = new Map<string, string>();
const originals = new WeakMap<EditableElement, { styles: Map<string, [string, string]>; attributes: Map<string, string | null>; text: Map<Node, string | null> }>();
function apply(element: EditableElement, override: ElementOverride) {
  let original = originals.get(element);
  if (!original) { original = { styles: new Map(), attributes: new Map(), text: new Map() }; originals.set(element, original); }
  for (const name of Object.keys(override.styles || {})) if (!original.styles.has(name)) original.styles.set(name, [element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]);
  for (const name of Object.keys(override.attributes || {})) if (!original.attributes.has(name)) original.attributes.set(name, element.getAttribute(name));
  if (override.text != null) for (const node of element.childNodes) if (node.nodeType === Node.TEXT_NODE && !original.text.has(node)) original.text.set(node, node.nodeValue);
  for (const [property, value] of Object.entries(override.styles || {})) {
    const key = `${property}=${value}`;
    if (!normalizedStyles.has(key)) { const probe = document.createElement('span').style; probe.setProperty(property, value); normalizedStyles.set(key, probe.getPropertyValue(property)); }
    const normalized = normalizedStyles.get(key)!;
    if (element.style.getPropertyValue(property) !== normalized || (normalized && element.style.getPropertyPriority(property) !== 'important')) element.style.setProperty(property, value, 'important');
  }
  for (const [name, value] of Object.entries(override.attributes || {})) {
    if (/^on/i.test(name) || ['style', 'id', 'class', 'data-workspace-editor'].includes(name)) continue;
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  }
  if (override.text != null) {
    // Keep React-owned child elements and event handlers intact.
    const texts = [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE);
    if (texts[0] && texts[0].nodeValue !== override.text) texts[0].nodeValue = override.text;
    for (const node of texts.slice(1)) if (node.nodeValue) node.nodeValue = '';
  }
}

function resetElement(element: EditableElement) {
  const original = originals.get(element);
  if (!original) return;
  for (const [name, [value, priority]] of original.styles) element.style.setProperty(name, value, priority);
  for (const [name, value] of original.attributes) { if (value == null) element.removeAttribute(name); else element.setAttribute(name, value); }
  for (const [node, value] of original.text) if (node.parentNode === element) node.nodeValue = value;
  originals.delete(element);
}

export function WorkspaceEditor({ scope, enabled, onEnabled }: { scope: string; enabled: boolean; onEnabled: (value: boolean) => void }) {
  const [gate, setGate] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const lock = () => { lockAdmin(); onEnabled(false); };
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(true);
  const [minimized, setMinimized] = useState(false);
  const [selected, setSelected] = useState<EditableElement | null>(null);
  const [text, setText] = useState('');
  const [styles, setStyles] = useState('{}');
  const [attributes, setAttributes] = useState('{}');
  const [revision, setRevision] = useState(0);
  const root = () => document.querySelector<HTMLElement>('.app');
  const keyFor = (element: EditableElement) => `${element.closest('#main') ? scope : 'global'}|${elementPath(element, root()!)}`;
  const select = (element: EditableElement) => {
    setMinimized(false);
    setSelected(element);
    const saved = workspaceElements[keyFor(element)] || {};
    setText(saved.text ?? [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.nodeValue).join(''));
    setStyles(JSON.stringify(saved.styles || {}, null, 2));
    setAttributes(JSON.stringify(saved.attributes || {}, null, 2));
    setError('');
  };
  useEffect(() => { setSelected(null); }, [scope, enabled]);
  useEffect(() => {
    document.documentElement.classList.toggle('workspace-editing', enabled && !minimized);
    return () => document.documentElement.classList.remove('workspace-editing');
  }, [enabled, minimized]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'e') {
        event.preventDefault(); event.stopPropagation();
        if (enabled) lock(); else { setGate(true); setError(''); }
      }
    };
    document.addEventListener('keydown', shortcut, true);
    return () => document.removeEventListener('keydown', shortcut, true);
  }, [enabled, onEnabled]);
  useEffect(() => {
    const app = root(); if (!app) return;
    let frame = 0;
    const restore = () => {
      for (const [key, override] of Object.entries(workspaceElements)) {
        const split = key.indexOf('|');
        if (![scope, 'global'].includes(key.slice(0, split))) continue;
        try { const selector = key.slice(split + 1); const target = selector === ':scope' ? app : app.querySelector<EditableElement>(selector); if (target && !target.closest('[data-workspace-editor]')) apply(target, override); } catch { /* A removed element no longer has a target. */ }
      }
    };
    restore();
    const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; restore(); }); });
    observer.observe(app, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [scope, revision]);
  useEffect(() => {
    if (!enabled || !picking) return;
    const listener = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement || target instanceof SVGElement) || target.closest('[data-workspace-editor], .workspace-drag-handle')) return;
      if (!target.closest('.app')) return;
      event.preventDefault(); event.stopPropagation(); select(target);
    };
    document.addEventListener('click', listener, true);
    return () => document.removeEventListener('click', listener, true);
  }, [enabled, picking, scope]);
  useEffect(() => {
    if (!enabled || !selected) return;
    selected.classList.add('workspace-selected');
    return () => selected.classList.remove('workspace-selected');
  }, [enabled, selected]);
  const update = (override: ElementOverride) => {
    if (!enabled || !selected?.isConnected) return;
    resetElement(selected);
    workspaceElements[keyFor(selected)] = override;
    apply(selected, override); setRevision(value => value + 1);
  };
  const jsonRecord = (value: string) => {
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object' || Object.values(parsed).some(item => typeof item !== 'string')) throw new Error('Use a JSON object with string values.');
    return parsed as Record<string, string>;
  };
  const [toolbar, setToolbar] = useState<Element | null>(null);
  useEffect(() => { setToolbar(document.querySelector('.titlebar .toolbar-group')); }, []);
  const control = <button data-workspace-editor className="icon-button" aria-label={enabled ? 'Lock workspace editor' : 'Unlock workspace editor'} title={enabled ? 'Lock workspace editor (Ctrl/⌘ + Shift + E)' : 'Unlock workspace editor (Ctrl/⌘ + Shift + E)'} onClick={() => { if (enabled) { lock(); setSelected(null); } else { setGate(true); setError(''); } }}>{enabled ? <LockKeyhole size={15} /> : <Pencil size={15} />}</button>;
  return <>
    {toolbar ? createPortal(control, toolbar) : <div data-workspace-editor className="workspace-editor-launch">{control}</div>}
    {gate && <div data-workspace-editor className="workspace-editor-backdrop"><form className="workspace-editor-gate" role="dialog" aria-modal="true" aria-label="Unlock workspace editing" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { setGate(false); setPasscode(''); setError(''); }
      if (event.key === 'Tab') {
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('input, button')];
        const first = items[0], last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }} onSubmit={async event => {
      event.preventDefault(); if (unlocking) return;
      if (passcode !== '9818') { setError('Incorrect passcode.'); return; }
      setUnlocking(true); setError('');
      try {
        const status = await adminStatus();
        if (status.configured && !status.unlocked) await unlockAdmin(passcode);
        if (!status.configured && scope.startsWith('15:')) throw new Error('Report editing is not configured on the server. Set the report admin passcode before adding report content.');
        onEnabled(true); setGate(false); setPasscode(''); setPicking(true);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not unlock report editing.'); }
      finally { setUnlocking(false); }
    }}>
      <h2>Unlock workspace editing</h2><label>Passcode<input autoFocus type="password" inputMode="numeric" value={passcode} onChange={event => setPasscode(event.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<div><button type="submit" className="button" disabled={unlocking}>{unlocking ? "Unlocking…" : "Unlock"}</button><button type="button" className="button" onClick={() => { setGate(false); setPasscode(''); setError(''); }}>Cancel</button></div>
    </form></div>}
    {enabled && <aside data-workspace-editor className={`workspace-editor-panel ${minimized ? "workspace-editor-minimized" : ""}`} aria-label="Element editor">
      <div className="workspace-editor-heading"><strong>Workspace editor</strong><button className="button" onClick={() => setMinimized(value => !value)}>{minimized ? "Expand" : "Minimize"}</button><button className="icon-button" aria-label="Lock editor" onClick={lock}><X size={16} /></button></div>
      {!minimized && <>
      <label><input type="checkbox" checked={picking} onChange={event => setPicking(event.target.checked)} /> Select elements to edit</label>
      <p className="small">Click any element to inspect it. Turn selection off to use filters and drilldowns. Use the navbar Save icon to keep changes. Text edits change the display; calculations still use source data.</p>
      {selected?.isConnected ? <>
        <code>{selected.tagName.toLowerCase()} · {selected.getAttribute('aria-label') || selected.getAttribute('class') || 'element'}</code>
        <button className="button" onClick={() => { if (selected.parentElement && selected.parentElement !== root()) select(selected.parentElement); }}>Select parent container</button>
        <label>Text content<textarea aria-label="Text content" value={text} onChange={event => setText(event.target.value)} disabled={![...selected.childNodes].some(node => node.nodeType === Node.TEXT_NODE)} /></label>
        <div className="workspace-editor-presets">{['color','background-color','font-size','font-weight','width','height','padding','margin','border-radius','gap','translate','rotate','opacity','display','grid-template-columns','grid-column','position','top','left','z-index','order'].map(property => <label key={property}>{property}<input placeholder={getComputedStyle(selected).getPropertyValue(property)} value={(() => { try { return JSON.parse(styles)[property] || ''; } catch { return ''; } })()} onChange={event => { try { setStyles(JSON.stringify({ ...jsonRecord(styles), [property]: event.target.value }, null, 2)); } catch { setError('Fix the CSS JSON first.'); } }} /></label>)}</div>
        <label>All CSS properties (JSON)<textarea aria-label="All CSS properties (JSON)" value={styles} onChange={event => setStyles(event.target.value)} spellCheck={false} /></label>
        <label>Element attributes (JSON)<textarea aria-label="Element attributes (JSON)" value={attributes} onChange={event => setAttributes(event.target.value)} spellCheck={false} /></label>
        <button className="button" onClick={() => { try { update({ text, styles: jsonRecord(styles), attributes: jsonRecord(attributes) }); setError(''); } catch (error) { setError(error instanceof Error ? error.message : 'Invalid properties'); } }}>Apply changes</button>
        <button className="button" onClick={() => { if (!selected) return; resetElement(selected); delete workspaceElements[keyFor(selected)]; setStyles('{}'); setAttributes('{}'); setRevision(value => value + 1); setText([...selected.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.nodeValue).join('')); setError('Element reset. Save to keep this reset.'); }}>Reset selected element</button>
      </> : <p>Select an element anywhere in the app.</p>}
      {error && <p role="status">{error}</p>}
      </>}
    </aside>}
  </>;
}
