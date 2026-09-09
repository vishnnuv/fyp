# 🚂 RailBot — Online Chatbot-Based Ticketing System

An AI-powered Indian Railway ticket booking chatbot with a ChatGPT-style conversational interface.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| Database | sql.js (pure-JS SQLite, no build tools needed) |
| NLP/AI | Groq API (llama-3.3-70b-versatile) |
| Styling | Vanilla CSS (ChatGPT-inspired design) |

---

## Quick Start

### 1. Prerequisites
- Node.js >= 18.x
- npm >= 9.x
- Internet connection (for Groq API calls)

### 2. Install Dependencies

```bash
# From the project root (fyp/)
npm install                  # installs concurrently

cd server && npm install     # installs Express, Groq SDK, sql.js
cd ../client && npm install  # installs React + Vite
```

Or use the convenience script:
```bash
npm run install:all
```

### 3. Configure API Key

The Groq API key is already set in `server/.env`. If you need to update it:

```
# server/.env
GROQ_API_KEY=your-groq-api-key-here
PORT=3001
NODE_ENV=development
```

### 4. Run the App

From the project root (fyp/):

```bash
npm run dev
```

This starts both servers simultaneously:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

Open your browser to http://localhost:5173

---

## How to Use

### Single Booking Flow
1. Type: "Book a ticket from Chennai to Bangalore on Monday"
2. Bot will ask for the number of tickets if missing
3. Bot shows 2-4 matching trains with fares
4. Click "Select" on a train card, or type "I'll take the second one"
5. Bot asks for confirmation -> type "Yes, confirm it"
6. Booking confirmed with PNR number!

### Multi-Booking Test Scenario (Key Feature)

Type this single message exactly:

```
Book a train from Chennai to Bangalore on Friday morning, and another from Bangalore to Chennai on Sunday evening
```

Expected behavior:
1. The LLM extracts two separate bookings from one message
2. Bot asks: "How many tickets for the Chennai to Bangalore trip?"
3. You reply: "2" (or "1 ticket each")
4. Bot shows Chennai->Bangalore Friday trains
5. You select one -> confirms -> PNR generated
6. Bot then processes the second Bangalore->Chennai booking
7. You select a train -> confirms -> second PNR generated

### Other Test Scenarios

| Scenario | Message |
|---|---|
| Missing fields | "I want to go to Bangalore" |
| Class preference | "Book Sleeper class from Chennai to Mumbai on Tuesday" |
| Natural selection | "Book the Shatabdi" or "I'll take option 1" |
| Named train | "Book the Vande Bharat from Bangalore to Chennai" |

---

## Project Structure

```
fyp/
+-- package.json              (Root: runs both servers with concurrently)
+-- README.md
+-- client/                   (React frontend - Vite)
|   +-- index.html
|   +-- vite.config.js        (Proxies /api -> :3001)
|   +-- src/
|       +-- App.jsx           (Root layout)
|       +-- index.css         (Global CSS design system)
|       +-- hooks/
|       |   +-- useChat.js    (Session state, API calls)
|       +-- components/
|           +-- Sidebar.jsx
|           +-- ChatWindow.jsx
|           +-- MessageBubble.jsx
|           +-- TrainCard.jsx
|           +-- ConfirmCard.jsx
|           +-- TypingIndicator.jsx
|           +-- InputBar.jsx
+-- server/                   (Express backend)
    +-- index.js              (Entry point)
    +-- .env                  (API keys)
    +-- data/
    |   +-- mock_train_data_v2.json
    +-- db/
    |   +-- init.js           (sql.js SQLite init)
    +-- routes/
    |   +-- chat.js           (POST /api/chat handler)
    +-- services/
        +-- llm.js            (Groq API + system prompt)
        +-- trainSearch.js    (Filter trains by route/day)
        +-- bookingStore.js   (PNR generation + SQLite writes)
```

---

## API Reference

### POST /api/chat
```json
{
  "message": "Book from Chennai to Bangalore on Monday",
  "sessionId": "session_1234567890_abc123"
}
```

Response types:
- text -- plain conversational reply
- train_options -- array of matching trains
- booking_confirmed -- PNR + full booking details

### GET /api/chat/bookings/:sessionId
Returns all bookings made in a session.

### GET /api/health
Health check endpoint.

---

## Architecture Notes

- Session state is kept in-memory on the server (Map keyed by sessionId)
- Conversation history is sent to the LLM on every message for context continuity
- No regex parsing -- all entity extraction is done by the LLM via structured JSON output
- Multi-booking: LLM returns a bookings[] array; server processes them sequentially
- SQLite bookings persist across server restarts (saved to server/db_files/bookings.sqlite)

---

## Troubleshooting

| Problem | Solution |
|---|---|
| LLM not responding | Check server/.env has valid GROQ_API_KEY |
| Port 3001 in use | Change PORT=3001 in server/.env |
| Port 5173 in use | Run: cd client && npx vite --port 3000 |
| Train not found | Verify the route exists in mock_train_data_v2.json |
