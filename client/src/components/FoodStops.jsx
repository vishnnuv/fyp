import { useState } from 'react';

export default function FoodStops({ booking, stops, actions }) {
  const [value, setValue] = useState('');

  return (
    <div className="food-stops">
      <div className="food-stops-context">
        <span className="booking-list-label">Delivering on</span>
        <span>{booking?.train_name} · PNR {booking?.pnr}</span>
      </div>
      <div className="food-stops-row">
        <select
          className="food-select"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Select a delivery stop"
          id="food-stop-select"
        >
          <option value="">Choose a stop…</option>
          {(stops || []).map((stop, index) => (
            <option key={`${stop.station}-${index}`} value={index}>
              {stop.station} — arrives {stop.arrival_time} ({stop.halt_minutes} min halt)
            </option>
          ))}
        </select>
        <button
          className="select-btn"
          disabled={value === ''}
          onClick={() => actions?.selectStop && actions.selectStop(Number(value))}
          aria-label="Confirm delivery stop"
          id="food-stop-confirm"
        >
          Select
        </button>
      </div>
    </div>
  );
}
