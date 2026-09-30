const { getDb, saveDbToDisk } = require('../db/init');

function generatePNR() {
  const digits = Math.floor(1000000 + Math.random() * 9000000);
  return `PNR${digits}`;
}

function saveBooking({
  sessionId,
  customerId,
  trainNumber,
  trainName,
  source,
  destination,
  travelDate,
  departureTime,
  arrivalTime,
  travelClass,
  farePerTicket,
  numTickets,
  razorpayOrderId = null,
  razorpayPaymentId = null,
  paymentMethod = null,
}) {
  const db = getDb();
  const pnr = generatePNR();
  const totalFare = farePerTicket * numTickets;

  db.run(
    `INSERT INTO bookings 
      (pnr, session_id, customer_id, train_number, train_name, source, destination, 
       travel_date, departure_time, arrival_time, travel_class, 
       fare_per_ticket, num_tickets, total_fare,
       razorpay_order_id, razorpay_payment_id, payment_method)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pnr, sessionId, customerId, trainNumber, trainName, source, destination,
     travelDate, departureTime, arrivalTime, travelClass,
     farePerTicket, numTickets, totalFare,
     razorpayOrderId, razorpayPaymentId, paymentMethod]
  );

  // Persist to disk after each write
  saveDbToDisk();

  return { pnr, totalFare };
}

function getBookingByPNR(pnr) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM bookings WHERE pnr = ?');
  stmt.bind([pnr]);
  if (stmt.step()) {
    return stmt.getAsObject();
  }
  return null;
}

function getBookingsBySession(sessionId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM bookings WHERE session_id = ? ORDER BY created_at DESC');
  stmt.bind([sessionId]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function getBookingsByCustomer(customerId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM bookings WHERE customer_id = ? ORDER BY created_at DESC');
  stmt.bind([customerId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function getBookingByPNRForCustomer(pnr, customerId) {
  const db = getDb();
  const stmt = db.prepare('SELECT * FROM bookings WHERE pnr = ? AND customer_id = ?');
  stmt.bind([pnr, customerId]);
  const booking = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return booking;
}

function cancelBooking(pnr, customerId) {
  const booking = getBookingByPNRForCustomer(pnr, customerId);
  if (!booking) return null;
  if (booking.status === 'CANCELLED') return { booking, wasAlreadyCancelled: true };

  const db = getDb();
  db.run('UPDATE bookings SET status = ? WHERE pnr = ? AND customer_id = ?', ['CANCELLED', pnr, customerId]);
  saveDbToDisk();
  return { booking: { ...booking, status: 'CANCELLED' }, wasAlreadyCancelled: false };
}

module.exports = { saveBooking, getBookingByPNR, getBookingsBySession, getBookingsByCustomer, getBookingByPNRForCustomer, cancelBooking };
