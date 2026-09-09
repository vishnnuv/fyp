export default function ConfirmCard({ pnr, train, booking, selectedClass, numTickets, totalFare, travelDate }) {
  return (
    <div className="confirm-card" role="region" aria-label="Booking confirmation" id="booking-confirmation">
      {/* Header */}
      <div className="confirm-card-header">
        <div className="confirm-checkmark" aria-hidden="true">✓</div>
        <div>
          <div className="confirm-title">Booking Confirmed!</div>
          <div className="confirm-pnr">
            PNR: <span className="confirm-pnr-code">{pnr}</span>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="confirm-details">
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Train</span>
          <span className="confirm-detail-value">{train.train_name}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Train No.</span>
          <span className="confirm-detail-value">#{train.train_number}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">From</span>
          <span className="confirm-detail-value">{booking.source}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">To</span>
          <span className="confirm-detail-value">{booking.destination}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Date</span>
          <span className="confirm-detail-value">{travelDate}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Departure</span>
          <span className="confirm-detail-value">{train.departure_time}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Arrival</span>
          <span className="confirm-detail-value">{train.arrival_time}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Class</span>
          <span className="confirm-detail-value">{selectedClass.type}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Passengers</span>
          <span className="confirm-detail-value">{numTickets}</span>
        </div>
        <div className="confirm-detail-item">
          <span className="confirm-detail-label">Fare/ticket</span>
          <span className="confirm-detail-value">₹{selectedClass.fare}</span>
        </div>
      </div>

      {/* Total */}
      <div className="confirm-total-fare">
        <span className="confirm-total-label">Total Amount</span>
        <span className="confirm-total-amount">₹{totalFare.toLocaleString('en-IN')}</span>
      </div>

      {/* Mock payment banner */}
      <div className="confirm-mock-payment" aria-label="Payment status">
        <span>💳</span>
        <span>Payment Successful (Demo Mode)</span>
      </div>
    </div>
  );
}
