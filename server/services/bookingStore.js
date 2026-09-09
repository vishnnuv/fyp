const { getDb, saveDbToDisk } = require('../db/init');

function generatePNR() {
  const digits = Math.floor(1000000 + Math.random() * 9000000);
  return `PNR${digits}`;
}

function saveBooking({
  sessionId,
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
}) {
  const db = getDb();
  const pnr = generatePNR();
  const totalFare = farePerTicket * numTickets;

  db.run(
    `INSERT INTO bookings 
      (pnr, session_id, train_number, train_name, source, destination, 
       travel_date, departure_time, arrival_time, travel_class, 
       fare_per_ticket, num_tickets, total_fare)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pnr, sessionId, trainNumber, trainName, source, destination,
     travelDate, departureTime, arrivalTime, travelClass,
     farePerTicket, numTickets, totalFare]
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

module.exports = { saveBooking, getBookingByPNR, getBookingsBySession };
