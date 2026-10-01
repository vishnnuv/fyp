export default function FoodBookings({ bookings, actions }) {
  return (
    <div className="food-bookings" role="list" aria-label="Choose a booking for the food order">
      {(bookings || []).map((booking, index) => (
        <div className="food-booking-row" role="listitem" key={booking.pnr}>
          <div className="food-booking-info">
            <div className="food-booking-pnr">
              <span className="booking-list-label">PNR</span>
              <strong className="booking-list-pnr">{booking.pnr}</strong>
            </div>
            <div className="food-booking-train">
              {booking.train_name} <span>#{booking.train_number}</span>
            </div>
            <div className="food-booking-meta">
              {booking.source} → {booking.destination} · {booking.travel_date} · {booking.departure_time} · {booking.travel_class}
            </div>
          </div>
          <button
            className="select-btn"
            onClick={() => actions?.selectBooking && actions.selectBooking(index)}
            aria-label={`Select booking ${booking.pnr}`}
            id={`food-booking-${index + 1}`}
          >
            Select
          </button>
        </div>
      ))}
    </div>
  );
}
