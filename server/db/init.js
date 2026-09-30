const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', 'db_files');
const DB_PATH = path.join(DB_DIR, 'bookings.sqlite');

let db = null;
let SQL = null;

function saveDbToDisk() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
}

async function initDb() {
  if (db) return db;

  SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pnr TEXT UNIQUE NOT NULL,
      session_id TEXT NOT NULL,
      customer_id TEXT,
      train_number TEXT NOT NULL,
      train_name TEXT NOT NULL,
      source TEXT NOT NULL,
      destination TEXT NOT NULL,
      travel_date TEXT NOT NULL,
      departure_time TEXT NOT NULL,
      arrival_time TEXT NOT NULL,
      travel_class TEXT NOT NULL,
      fare_per_ticket INTEGER NOT NULL,
      num_tickets INTEGER NOT NULL,
      total_fare INTEGER NOT NULL,
      status TEXT DEFAULT 'CONFIRMED',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Keep existing local bookings when upgrading the demo database.
  const tableInfo = db.exec('PRAGMA table_info(bookings)');
  const columns = tableInfo[0]?.values.map((row) => row[1]) || [];
  if (!columns.includes('customer_id')) {
    db.run('ALTER TABLE bookings ADD COLUMN customer_id TEXT');
  }
  db.run('UPDATE bookings SET customer_id = session_id WHERE customer_id IS NULL');
  // Razorpay payment audit trail (test mode in this demo).
  if (!columns.includes('razorpay_order_id')) db.run('ALTER TABLE bookings ADD COLUMN razorpay_order_id TEXT');
  if (!columns.includes('razorpay_payment_id')) db.run('ALTER TABLE bookings ADD COLUMN razorpay_payment_id TEXT');
  if (!columns.includes('payment_method')) db.run('ALTER TABLE bookings ADD COLUMN payment_method TEXT');

  saveDbToDisk();
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

module.exports = { initDb, getDb, saveDbToDisk };
