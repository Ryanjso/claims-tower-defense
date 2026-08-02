import { clickMenu } from '../audio/sfx';
import { EventBus } from '../game/EventBus';
import { useGame } from '../state/store';
import { dollars, pct } from './format';

/**
 * End-of-run scorecard, deliberately shaped like the report a TPA actually sends
 * a plan sponsor: billed charges in, what the plan paid, and the containment rate.
 */
export function EndScreen() {
  const phase = useGame((s) => s.phase);
  const lives = useGame((s) => s.lives);
  const round = useGame((s) => s.round);
  const totalRounds = useGame((s) => s.totalRounds);
  const entered = useGame((s) => s.billedEntered);
  const leaked = useGame((s) => s.billedLeaked);

  if (phase !== 'won' && phase !== 'lost') return null;

  const won = phase === 'won';
  const contained = entered === 0 ? 1 : 1 - leaked / entered;

  return (
    <div className="modal">
      <div className={`modal__box endcard ${won ? 'is-won' : 'is-lost'}`}>
        <div className="endcard__flag">{won ? 'Plan year closed' : 'Plan insolvent'}</div>
        <h2>
          {won
            ? 'You contained the year.'
            : `The plan ran out of covered lives in round ${round + 1}.`}
        </h2>
        <p className="endcard__lede">
          {won
            ? `All ${totalRounds} rounds cleared with ${lives} covered lives remaining.`
            : 'Too many claims reached the plan. Members lost coverage.'}
        </p>

        <dl className="scorecard">
          <div>
            <dt>Billed charges</dt>
            <dd>{dollars(entered)}</dd>
          </div>
          <div>
            <dt>Reached the plan</dt>
            <dd className="is-bad">{dollars(leaked)}</dd>
          </div>
          <div>
            <dt>Kept off the plan</dt>
            <dd className="is-good">{dollars(entered - leaked)}</dd>
          </div>
          <div>
            <dt>Containment rate</dt>
            <dd className="is-good">{pct(contained)}</dd>
          </div>
          <div>
            <dt>Rounds cleared</dt>
            <dd>
              {round} / {totalRounds}
            </dd>
          </div>
          <div>
            <dt>Covered lives left</dt>
            <dd>{lives}</dd>
          </div>
        </dl>

        <p className="endcard__note">
          No single strategy gets you here. Pricing without navigation leaves volume untouched;
          navigation without stop-loss leaves you exposed to the one claim that matters.
        </p>

        <button type="button" className="go" onClick={() => {
            clickMenu();
            EventBus.send({ type: 'restart' });
          }}>
          <span className="go__round">Play again</span>
          <span className="go__title">New plan year</span>
        </button>
      </div>
    </div>
  );
}
