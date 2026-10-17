import { useEffect } from 'react';
import { workspaceOrders } from '../state/workspaceLayout';
import '../design/workspace-layout.css';

/** CSS ordering leaves React's DOM ownership intact, including live table state. */
export function useWorkspaceDrag(root: React.RefObject<HTMLElement>, scope: string, ready: boolean, enabled = false) {
  useEffect(() => {
    const canvas = root.current;
    if (!canvas) return;
    let dragged: HTMLElement | null = null;
    const cleanup: (() => void)[] = [];
    const scan = () => {
      const parents = [canvas, ...canvas.querySelectorAll<HTMLElement>('div, section')];
      for (const parent of parents) {
        if (parent.closest('table, [role="dialog"], .chart, .echarts')) continue;
        const children = [...parent.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !el.matches('button, script, style, .print-context, .page-intro') && ((parent === canvas && el.matches('div, section, article, aside')) || el.matches('section, article, .register, .metric-card') || !!el.querySelector('h2, h3') || el.matches('.metric, .metric-card, .metric-flip, .chart-card, .panel, [data-workspace-element]')));
        if (children.length < 2) continue;
        const display = getComputedStyle(parent).display;
        if (!/grid|flex/.test(display) && parent !== canvas) continue;
        if (parent === canvas && !/grid|flex/.test(display)) parent.classList.add('workspace-sort-stack');
        const path: string[] = [];
        let node: HTMLElement | null = parent;
        while (node && node !== canvas) {
          path.unshift(node.id || `${node.tagName}.${node.className.toString().replace(/workspace-\S+/g, '').trim()}:${[...node.parentElement!.children].indexOf(node)}`);
          node = node.parentElement;
        }
        const group = `${scope}/${path.join('/') || 'main'}`;
        const currentChildren = () => [...parent.children].filter((el): el is HTMLElement => el instanceof HTMLElement && !!el.dataset.workspaceItem);
        children.forEach((child, index) => {
          if (child.dataset.workspaceItem) return;
          const id = child.id || `${child.tagName}.${child.className.toString().replace(/workspace-\S+/g, "").trim()}:${index}`;
          child.dataset.workspaceItem = id;
          const order = workspaceOrders[group];
          child.style.order = String(order?.includes(id) ? order.indexOf(id) : index);
          const position = child.style.position;
          if (getComputedStyle(child).position === 'static') child.style.position = 'relative';
          const handle = document.createElement('button');
          handle.hidden = !enabled;
          handle.type = 'button'; handle.className = 'workspace-drag-handle'; handle.textContent = '⠿'; handle.draggable = true;
          const label = child.querySelector('h2, h3')?.textContent || `element ${index + 1}`;
          handle.setAttribute('aria-label', `Move ${label}. Use Alt and arrow keys to reorder.`);
          handle.title = 'Drag to reorder · Alt + arrow keys';
          const move = (target: HTMLElement) => {
            const ordered = currentChildren().sort((a, b) => Number(a.style.order) - Number(b.style.order));
            const from = ordered.indexOf(child), to = ordered.indexOf(target);
            ordered.splice(from, 1); ordered.splice(to, 0, child);
            ordered.forEach((el, i) => { el.style.order = String(i); });
            workspaceOrders[group] = ordered.map(el => el.dataset.workspaceItem!);
          };
          handle.ondragstart = e => { if (!enabled) { e.preventDefault(); return; } dragged = child; e.stopPropagation(); e.dataTransfer?.setData('text/plain', id); };
          handle.ondragend = () => { dragged = null; };
          const over = (e: DragEvent) => { if (dragged && currentChildren().includes(dragged)) { e.preventDefault(); e.stopPropagation(); } };
          const drop = (e: DragEvent) => { if (!dragged || !currentChildren().includes(dragged)) return; e.preventDefault(); e.stopPropagation(); const source = dragged; dragged = null; source.querySelector<HTMLButtonElement>(':scope > .workspace-drag-handle')?.dispatchEvent(new CustomEvent('workspace-move', { detail: child })); };
          handle.addEventListener('workspace-move', ((e: CustomEvent<HTMLElement>) => move(e.detail)) as EventListener);
          handle.onkeydown = e => { if (!enabled || !e.altKey || !['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return; e.preventDefault(); const ordered = currentChildren().sort((a,b) => +a.style.order - +b.style.order); const target = ordered[ordered.indexOf(child) + (['ArrowUp','ArrowLeft'].includes(e.key) ? -1 : 1)]; if (target) move(target); };
          child.addEventListener('dragover', over); child.addEventListener('drop', drop); child.append(handle);
          cleanup.push(() => { handle.remove(); child.removeEventListener('dragover', over); child.removeEventListener('drop', drop); delete child.dataset.workspaceItem; child.style.order = ''; child.style.position = position; });
        });
      }
    };
    scan();
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; scan(); });
    });
    observer.observe(canvas, { childList: true, subtree: true });
    return () => { observer.disconnect(); cancelAnimationFrame(frame); cleanup.forEach(fn => fn()); canvas.classList.remove('workspace-sort-stack'); };
  }, [root, scope, ready, enabled]);
}
