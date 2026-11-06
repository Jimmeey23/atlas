import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { NarrativeCard } from './derive';
import { Panel, StatusPill } from './ui';

function Narrative({ card, onExplore }: { card: NarrativeCard; onExplore?: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const long = card.finding.length > 230 || card.basis.length > 150;
  return <article className="kra-narrative">
    <div className="kra-narrative-head">
      <h3>{card.title}</h3>
      <StatusPill state={card.trajectory} />
    </div>
    <p className={open ? undefined : 'is-clamped'}>{card.finding}</p>
    <p className={`kra-narrative-basis ${open ? '' : 'is-clamped-2'}`}>{card.basis}</p>
    {long && <button type="button" className="kra-note-toggle" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{open ? 'Show less' : 'Read full finding'}</button>}
    <div className="kra-narrative-action">
      <h4>Suggested next step</h4>
      <p>{card.action}</p>
    </div>
    {onExplore && <button type="button" className="kra-text-button" onClick={() => onExplore(card.key)}>
      View supporting records <ArrowUpRight size={11} />
    </button>}
  </article>;
}

export function Narratives({ cards, onExplore }: { cards: NarrativeCard[]; onExplore?: (key: string) => void }) {
  if (!cards.length) return null;
  return <section className="kra-section" aria-labelledby="kra-narratives-heading">
    <div className="kra-section-head">
      <div className="kra-section-head-copy">
        <span className="kra-eyebrow">What moved</span>
        <h2 id="kra-narratives-heading">Why performance changed</h2>
        <p>Each finding is read from the source records and states its basis. Suggested next steps are separate from logged execution.</p>
      </div>
    </div>
    <div className="kra-narratives">
      {cards.map((card) => <Narrative key={card.key} card={card} onExplore={onExplore} />)}
    </div>
  </section>;
}

export { Panel };
