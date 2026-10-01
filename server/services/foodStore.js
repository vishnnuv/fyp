const { getDb, saveDbToDisk } = require('../db/init');

// Food orders are their own records; the PNR is the only link to a ticket.
function generateFoodOrderId() {
  const digits = Math.floor(1000000 + Math.random() * 9000000);
  return `FOOD${digits}`;
}

function saveFoodOrder({
  pnr,
  station,
  items,
  total,
  sessionId = null,
  customerId = null,
  trainNumber = null,
  trainName = null,
}) {
  const db = getDb();
  const orderId = generateFoodOrderId();
  const itemsText = Array.isArray(items)
    ? items.map((item) => (typeof item === 'string' ? item : `${item.name} (₹${item.price})`)).join(', ')
    : String(items);

  db.run(
    `INSERT INTO food_orders
      (order_id, pnr, session_id, customer_id, train_number, train_name, station, items, total)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [orderId, pnr, sessionId, customerId, trainNumber, trainName, station, itemsText, total],
  );

  saveDbToDisk();
  return { orderId, total, items: itemsText };
}

function getFoodOrdersBySession(sessionId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM food_orders WHERE session_id = ? ORDER BY created_at DESC');
  stmt.bind([sessionId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

function getFoodOrdersByCustomer(customerId) {
  const db = getDb();
  const results = [];
  const stmt = db.prepare('SELECT * FROM food_orders WHERE customer_id = ? ORDER BY created_at DESC');
  stmt.bind([customerId]);
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

module.exports = { saveFoodOrder, getFoodOrdersBySession, getFoodOrdersByCustomer };
