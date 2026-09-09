require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Routes
const chatRouter = require('./routes/chat');
app.use('/api/chat', chatRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize DB then start server
initDb()
  .then(() => {
    console.log('✅ SQLite database initialized (sql.js)');
    app.listen(PORT, () => {
      console.log(`🚂 RailBot server running on http://localhost:${PORT}`);
      if (!process.env.GROQ_API_KEY) {
        console.warn('⚠️  GROQ_API_KEY not set — please add it to server/.env');
      }
    });
  })
  .catch((err) => {
    console.error('❌ Database init failed:', err.message);
    process.exit(1);
  });
