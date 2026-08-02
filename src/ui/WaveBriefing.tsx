import { clickMenu } from '../audio/sfx';
import { EventBus } from '../game/EventBus';
import { BRIEFINGS } from '../game/data/briefings';
import { TOWERS } from '../game/data/towers';
import { useGame } from '../state/store';
import { hexColor } from './format';

/**
 * Warns before a round the player has no answer to.
 *
 * Purely a view. Which briefing is pending, whether it has been seen, and
 * whether it holds the round queue are all decided in GameScene, because
 * auto-start fires in the same frame a round ends — anything React decided
 * after rendering would arrive a frame too late to stop it.
 */
export function WaveBriefing() {
  const pending = useGame((s) => s.pendingBriefing);
  const round = useGame((s) => s.round);

  const brief = BRIEFINGS.find((b) => b.id === pending);
  if (!brief) return null;

  const accept = () => {
    clickMenu();
    EventBus.send({ type: 'dismissBriefing' });
  };

  return (
    <div className="modal modal--brief" role="dialog">
      <div className="brief">
        <div className="brief__tape" aria-hidden />
        <div className="brief__eyebrow">
          Round {round + 1} · {brief.eyebrow}
        </div>
        <h2>{brief.title}</h2>

        <p className="brief__why">{brief.why}</p>

        <div className="brief__fix">
          <h3>What answers it</h3>
          <p>{brief.fix}</p>
          <ul className="brief__towers">
            {brief.answers.map((id) => (
              <li key={id} style={{ '--accent': hexColor(TOWERS[id].color) } as React.CSSProperties}>
                <span>{TOWERS[id].glyph}</span>
                {TOWERS[id].name}
                <em>${TOWERS[id].cost.toLocaleString()}</em>
              </li>
            ))}
          </ul>
        </div>

        <button type="button" className="go" onClick={accept}>
          <span className="go__round">Understood</span>
          <span className="go__title">Build now, or start the round anyway</span>
        </button>
      </div>
    </div>
  );
}
