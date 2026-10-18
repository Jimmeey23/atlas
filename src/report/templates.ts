/** Visual templates only: selecting one never changes chapter scope, evidence or AI instructions. */
export const REPORT_TEMPLATES = [
  { id: 'executive', name: 'Executive', category: 'Leadership', description: 'A precise management review with a split masthead, clear chapter rules and balanced evidence.', structure: 'Split cover · balanced columns', serif: false },
  { id: 'editorial', name: 'Editorial', category: 'Long read', description: 'A considered journal with serif headlines, a narrow reading measure and generous white space.', structure: 'Literary cover · single-column analysis', serif: true },
  { id: 'boardroom', name: 'Boardroom', category: 'Leadership', description: 'A formal board pack with a centered dark cover, framed chapters and strong section numbering.', structure: 'Centered cover · framed chapters', serif: true },
  { id: 'dashboard', name: 'Dashboard', category: 'Analytical', description: 'A modular performance review with a compact masthead, tiled findings and prominent measures.', structure: 'Compact cover · modular evidence grid', serif: false },
  { id: 'ledger', name: 'Ledger', category: 'Analytical', description: 'A disciplined analyst’s edition with compact typography, ruled tables and precise numeric detail.', structure: 'Report register · compact reading', serif: false },
  { id: 'magazine', name: 'Magazine', category: 'Long read', description: 'An expressive review with oversized type, asymmetric chapter headings and open editorial columns.', structure: 'Statement cover · asymmetric headings', serif: true },
  { id: 'minimal', name: 'Essential', category: 'Leadership', description: 'A quiet, restrained document with unboxed findings, fine rules and an uninterrupted reading flow.', structure: 'Understated cover · open reading', serif: false },
  { id: 'dossier', name: 'Dossier', category: 'Analytical', description: 'A structured intelligence brief with a numbered margin, inset analysis and distinctly ruled chapters.', structure: 'Indexed cover · numbered chapter margin', serif: false },
  { id: 'studio', name: 'Studio', category: 'Long read', description: 'A warm, refined studio journal with softly rounded panels, serif titles and spacious evidence cards.', structure: 'Soft cover · journal cards', serif: true },
  { id: 'panorama', name: 'Panorama', category: 'Analytical', description: 'A broad landscape review with horizontal contents, wide evidence and a spacious performance canvas.', structure: 'Wide cover · horizontal chapter index', serif: false },
] as const;
export type ReportTemplate = typeof REPORT_TEMPLATES[number]['id'];
export function reportTemplate(id?: string) {
  return REPORT_TEMPLATES.find(template => template.id === id) ?? REPORT_TEMPLATES[0];
}
