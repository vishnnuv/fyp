import { useState } from 'react';

export default function TrainCard({ train, index, booking, numTickets, onSelect }) {
  const hasAvailableClass = train.classes.some(c => c.seats_available > 0);
  const [selectedClassType, setSelectedClassType] = useState(null);

  // Determine cheapest available class for quick display
  const availableClasses = train.classes.filter(c => c.seats_available > 0);
  const cheapest = availableClasses.length > 0
    ? availableClasses.reduce((a, b) => a.fare < b.fare ? a : b)
    : train.classes[0];

  const handleSelect = (travelClass = null) => {
    if (onSelect) onSelect(train.train_name, index, travelClass);
  };

  return (
    <div
      className="train-card"
      role="article"
      aria-label={`Train option ${index + 1}: ${train.train_name}`}
      id={`train-option-${index + 1}`}
    >
      {/* Card Header */}
      <div className="train-card-header">
        <span className="train-card-number-badge">#{train.train_number}</span>
        <span className="train-card-index">Option {index + 1}</span>
      </div>

      {/* Train Name */}
      <div className="train-card-name">{train.train_name}</div>

      {/* Route Timeline */}
      <div className="train-card-route">
        <div>
          <div className="train-time">{train.departure_time}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{train.source}</div>
        </div>

        <div className="train-route-divider">
          <div className="train-duration">{train.duration}</div>
          <div className="train-route-line">
            <span className="route-dot" />
            <span className="route-dash" />
            <span className="route-arrow">▶</span>
            <span className="route-dash" />
            <span className="route-dot" />
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className="train-time">{train.arrival_time}</div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{train.destination}</div>
        </div>
      </div>

      {/* Classes & Fares */}
      <div className="train-card-classes">
        {train.classes.map((cls, i) => (
          <button
            key={i}
            className={`class-tag class-select ${selectedClassType === cls.type ? 'selected' : ''} ${cls.seats_available === 0 ? 'no-seats' : ''}`}
            title={cls.seats_available === 0 ? 'No seats available' : `${cls.seats_available} seats available`}
            onClick={() => setSelectedClassType(cls.type)}
            disabled={cls.seats_available === 0}
            aria-label={`Select ${train.train_name} in ${cls.type}`}
          >
            <span>{cls.type}</span>
            <span className="class-fare">₹{cls.fare}</span>
            <span className="class-seats">
              {cls.seats_available === 0
                ? '(Full)'
                : `(${cls.seats_available} left)`}
            </span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div className="train-card-footer">
        <span className="train-days">
          Runs: {train.days_of_run.join(', ')}
        </span>
        <button
          className="select-btn"
          onClick={() => handleSelect(selectedClassType)}
          disabled={!hasAvailableClass || !selectedClassType}
          aria-label={`Select ${train.train_name}`}
          id={`select-train-${index + 1}`}
        >
          {hasAvailableClass ? 'Select →' : 'Full'}
        </button>
      </div>
    </div>
  );
}
