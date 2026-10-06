export type NoteConnector = {
  id: string;
  type: "arrow" | "line";
  target: { selector: string; x: number; y: number; label: string };
};
// Prefer semantic anchors so targets survive filter changes and unrelated saved elements.
export function elementSelector(element: HTMLElement, canvas: HTMLElement) {
  const anchor = element.closest<HTMLElement>(
    "[data-note-anchor], .register[data-index], [id]",
  );
  if (anchor && canvas.contains(anchor) && anchor !== canvas) {
    if (anchor.dataset.noteAnchor)
      return `[data-note-anchor="${CSS.escape(anchor.dataset.noteAnchor)}"]`;
    const prefix = anchor.id
      ? `#${CSS.escape(anchor.id)}`
      : `.register[data-index="${CSS.escape(anchor.dataset.index!)}"]`;
    const path: string[] = [];
    let child: HTMLElement | null = element;
    while (child && child !== anchor) {
      const siblings = [...child.parentElement!.children].filter(
        (s) => s.tagName === child!.tagName,
      );
      path.unshift(
        `${child.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(child) + 1})`,
      );
      child = child.parentElement;
    }
    return prefix + (path.length ? " > " + path.join(" > ") : "");
  }
  const segments: string[] = [];
  let node: HTMLElement | null = element;
  while (node && node !== canvas) {
    const tag = node.tagName.toLowerCase();
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter(
          (s) => s.tagName === node!.tagName,
        )
      : [];
    segments.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
    node = node.parentElement;
  }
  return "#main > " + segments.join(" > ");
}
