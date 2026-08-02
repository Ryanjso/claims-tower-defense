import { useState } from 'react';
import { clickMenu } from '../audio/sfx';
import { CLAIMS, CLAIM_ORDER } from '../game/data/claims';
import { dollars, hexColor } from './format';

/**
 * Reference panel for the claim ladder. Doubles as the educational payload: every
 * entry carries a real fact about why that claim type costs what it costs.
 */
export function Bestiary() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="ghostbtn" onClick={() => { clickMenu(); setOpen(true); }}>
        Claim types
      </button>

      {open && (
        <div className="modal" role="dialog" aria-modal="true" onClick={() => { clickMenu(); setOpen(false); }}>
          <div className="modal__box modal__box--wide" onClick={(e) => e.stopPropagation()}>
            <header className="modal__head">
              <div>
                <h2>The claim ladder</h2>
                <p>
                  Claims are not destroyed, they are repriced. Every hit knocks a claim down to
                  cheaper claims until the allowed amount reaches zero.
                </p>
              </div>
              <button type="button" className="modal__close" onClick={() => { clickMenu(); setOpen(false); }}>
                ×
              </button>
            </header>

            <div className="ladder">
              {CLAIM_ORDER.map((id) => {
                const c = CLAIMS[id];
                return (
                  <article key={id} className="ladder__row">
                    <span
                      className="ladder__chip"
                      style={{ background: hexColor(c.color) }}
                      aria-hidden
                    >
                      {c.glyph}
                    </span>
                    <div className="ladder__main">
                      <div className="ladder__name">
                        {c.name}
                        {c.tier >= 11 && <em className="ladder__tag">Catastrophic</em>}
                      </div>
                      <p>{c.fact}</p>
                    </div>
                    <div className="ladder__nums">
                      <span>{dollars(c.billed)}</span>
                      <span className="ladder__lives">−{c.leakLives} lives if it lands</span>
                      <span className="ladder__into">
                        {c.child
                          ? `Breaks into ${c.child.count}× ${CLAIMS[c.child.type].name}`
                          : 'Fully contained'}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <footer className="modal__foot">
              <h3>Claim traits</h3>
              <ul className="traits">
                <li>
                  <em style={{ color: '#b388ff' }}>Out-of-network</em> — most towers cannot even see
                  it. Needs navigation, RBP, plan design, a cash card or stop-loss.
                </li>
                <li>
                  <em style={{ color: '#dfe6ee' }}>Cleanly coded</em> — coding edits slide right off.
                  Needs a pricing or contracting answer.
                </li>
                <li>
                  <em style={{ color: '#ffd479' }}>Prior authorised</em> — double health on that
                  layer.
                </li>
                <li>
                  <em style={{ color: '#ff9e80' }}>Balance billed</em> — heals chip damage. You have
                  to finish it outright.
                </li>
              </ul>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
