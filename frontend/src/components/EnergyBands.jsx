import { useEnergy } from "../contexts/EnergyContext";
import { recordCheckIn } from "../services/rhythm";

const BANDS = [
  { id: "low", label: "Low", level: 2 },
  { id: "medium", label: "Medium", level: 3 },
  { id: "high", label: "High", level: 5 },
];

function bandForEnergy(energy) {
  if (energy <= 2) return "low";
  if (energy >= 4) return "high";
  return "medium";
}

export default function EnergyBands() {
  const { energy, setEnergy } = useEnergy();
  const active = bandForEnergy(energy);

  function choose(level) {
    setEnergy(level);
    recordCheckIn(level);
  }

  return (
    <div className="energy-bands" role="group" aria-label="Energy level">
      {BANDS.map((band) => (
        <button
          key={band.id}
          type="button"
          className={`energy-band${active === band.id ? " active" : ""}`}
          aria-pressed={active === band.id}
          onClick={() => choose(band.level)}
        >
          {band.label}
        </button>
      ))}
    </div>
  );
}
