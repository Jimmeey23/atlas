import { useLayoutEffect, type RefObject } from 'react';

const marker = '[data-section-number]';

/** Number visible sections in workspace order, including lazy and reordered sections. */
export function useSectionNumbers(root: RefObject<HTMLElement>, scope: string) {
  useLayoutEffect(() => {
    const canvas = root.current;
    if (!canvas) return;
    let frame = 0;
    const numberSections = () => {
      let index = 0;
      const visit = (element: Element) => {
        if (!element.matches(marker) && !element.querySelector(marker)) return;
        const style = getComputedStyle(element);
        if (element.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') return;
        if (element.matches(marker)) {
          const label = String(++index).padStart(2, '0');
          if (element.textContent !== label) element.textContent = label;
          return;
        }
        const children = [...element.children];
        // CSS order is how the workspace editor persists layout without moving React nodes.
        if (/flex|grid/.test(style.display)) {
          children.sort((a, b) => Number(getComputedStyle(a).order) - Number(getComputedStyle(b).order));
        }
        children.forEach(visit);
      };
      visit(canvas);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; numberSections(); });
    };
    const observer = new MutationObserver(records => {
      if (records.some(({ target }) => target instanceof Element &&
        (target.matches(marker) || target.querySelector(marker)))) schedule();
    });
    numberSections();
    observer.observe(canvas, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    window.addEventListener('resize', schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
    };
  }, [root, scope]);
}
