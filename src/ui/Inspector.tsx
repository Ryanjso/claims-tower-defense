import { clickMenu, playSfx } from '../audio/sfx';
import { EventBus } from '../game/EventBus';
import { TOWERS } from '../game/data/towers';
import { ZONES } from '../game/data/zones';
import { useGame } from '../state/store';
import type { TargetMode } from '../game/types';
import { hexColor } from './format';

const MODES: Array<{ id: TargetMode; label: string; hint: string }> = [
  { id: 'first', label: 'First', hint: 'Closest to the plan' },
  { id: 'last', label: 'Last', hint: 'Furthest from the plan' },
  { id: 'strong', label: 'Costliest', hint: 'Highest billed charge' },
  { id: 'close', label: 'Nearest', hint: 'Closest to this tower' },
];

export function Inspector() {
  const selected = useGame((s) => s.selected);
  const savings = useGame((s) => s.savings);
  const placing = useGame((s) => s.placing);
  const placementReason = useGame((s) => s.placementReason);
  const placementOk = useGame((s) => s.placementOk);

  if (placing) {
    const def = TOWERS[placing];
    return (
      <section className="panel panel--inspector is-pulled">
        <h2 className="panel__title">Placing {def.name}</h2>
        <p className="hint">
          Click open ground to build. Hold <kbd>Shift</kbd> to place several.
          Press <kbd>Esc</kbd> to cancel.
        </p>
        <div className={`placement ${placementOk ? 'is-ok' : 'is-bad'}`}>
          {placementOk ? 'Clear ground — click to build' : placementReason || 'Move over the map'}
        </div>
        <p className="fact">{def.fact}</p>
      </section>
    );
  }

  if (!selected) {
    return (
      <section className="panel panel--inspector">
        <h2 className="panel__title">No tower selected</h2>
        <p className="hint">
          Pick a strategy above to build, or click a tower on the map to upgrade it.
        </p>
      </section>
    );
  }

  const def = TOWERS[selected.type];
  const nextUpgrade = selected.tier < 3 ? def.upgrades[selected.tier] : null;
  const canAfford = nextUpgrade ? savings >= nextUpgrade.cost : false;
  const zone = ZONES.find((z) => z.id === selected.zoneId);

  return (
    <section
      className="panel panel--inspector is-pulled"
      style={{ '--accent': hexColor(def.color) } as React.CSSProperties}
    >
      <h2 className="panel__title">
        {def.name}
        <span className="tierpips">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i < selected.tier ? 'is-on' : ''} />
          ))}
        </span>
      </h2>

      <dl className="stats">
        <div>
          <dt>Damage</dt>
          <dd>{selected.damage}</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd>{selected.range >= 900 ? 'Whole map' : selected.range}</dd>
        </div>
        <div>
          <dt>Every</dt>
          <dd>{selected.cooldown}s</dd>
        </div>
      </dl>

      {zone && (
        <p className="zonetag">
          In {zone.name} — {zone.blurb}
        </p>
      )}
      {selected.buffed && <p className="bufftag">Boosted by Tracy</p>}

      <div className="targeting">
        <span className="targeting__label">Target</span>
        <div className="segmented">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.hint}
              className={selected.targetMode === m.id ? 'is-on' : ''}
              onClick={() => {
                if (selected.targetMode !== m.id) clickMenu();
                EventBus.send({ type: 'setTargetMode', id: selected.id, mode: m.id });
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {nextUpgrade ? (
        <button
          type="button"
          className={`upgrade ${canAfford ? '' : 'is-locked'}`}
          onClick={() => {
            // Silent when unaffordable, so the click keeps meaning "that worked".
            if (canAfford) clickMenu();
            EventBus.send({ type: 'upgradeTower', id: selected.id });
          }}
        >
          <span className="upgrade__head">
            <span className="upgrade__name">{nextUpgrade.name}</span>
            <span className="upgrade__cost">${nextUpgrade.cost.toLocaleString()}</span>
          </span>
          <span className="upgrade__blurb">{nextUpgrade.blurb}</span>
        </button>
      ) : (
        <div className="upgrade is-max">Fully upgraded</div>
      )}

      <button
        type="button"
        className="sell"
        onClick={() => {
          playSfx('sell');
          EventBus.send({ type: 'sellTower', id: selected.id });
        }}
      >
        Sell for ${selected.sellValue.toLocaleString()}
      </button>

      <p className="fact">{def.fact}</p>
    </section>
  );
}
