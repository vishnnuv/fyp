export default function BookingList({ bookings }) {
  return (
    <div className="booking-list" role="list" aria-label="Saved bookings">
      {bookings.map((booking) => (
        <article className="booking-list-card" role="listitem" key={booking.pnr}>
          <div className="booking-list-card-header">
            <div>
              <span className="booking-list-label">PNR</span>
              <strong className="booking-list-pnr">{booking.pnr}</strong>
            </div>
            <span className={`booking-status ${booking.status === 'CANCELLED' ? 'cancelled' : ''}`}>
              {booking.status}
            </span>
          </div>
          <div className="booking-list-train">{booking.train_name} <span>#{booking.train_number}</span></div>
          <div className="booking-list-route">{booking.source} <span>→</span> {booking.destination}</div>
          <div className="booking-list-meta">
            <span>{booking.travel_date} · {booking.departure_time}</span>
            <span>{booking.travel_class}</span>
            <span>{booking.num_tickets} ticket{booking.num_tickets > 1 ? 's' : ''} · ₹{booking.total_fare}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
