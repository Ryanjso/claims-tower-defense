import { clickMenu } from '../audio/sfx';
import { EventBus } from '../game/EventBus';
import { TOWERS, TOWER_ORDER } from '../game/data/towers';
import { ZONES } from '../game/data/zones';
import { useGame } from '../state/store';
import { hexColor } from './format';

/** Zones a tower is welcome in, for the shop card footnote. */
function homeZones(id: string) {
  return ZONES.filter((z) => z.allow.includes(id as never)).map((z) => z.name);
}

export function Shop() {
  const savings = useGame((s) => s.savings);
  const placing = useGame((s) => s.placing);

  return (
    <section className="panel panel--bare">
      <h2 className="panel__title">Containment strategies</h2>
      <div className="shop">
        {TOWER_ORDER.map((id) => {
          const def = TOWERS[id];
          const affordable = savings >= def.cost;
          const active = placing === id;
          const zones = homeZones(id);
          return (
            <button
              key={id}
              type="button"
              className={`card ${active ? 'is-active' : ''} ${affordable ? '' : 'is-locked'}`}
              style={{ '--accent': hexColor(def.color) } as React.CSSProperties}
              onClick={() => {
                clickMenu();
                EventBus.send({ type: 'selectTowerType', tower: active ? null : id });
              }}
            >
              <img
                className="card__portrait"
                src={`${import.meta.env.BASE_URL}assets/ui/portrait-${id}.png`}
                alt=""
                width={48}
                height={48}
                draggable={false}
              />
              <span className="card__body">
                <span className="card__name">{def.name}</span>
                <span className="card__blurb">{def.blurb}</span>
                {zones.length > 0 && <span className="card__zone">Bonus in {zones.join(', ')}</span>}
              </span>
              <span className="card__cost">${def.cost.toLocaleString()}</span>
              <span className="tip" role="tooltip">
                <strong>{def.name}</strong>
                {def.fact}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
