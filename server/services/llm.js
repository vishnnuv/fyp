const Groq = require('groq-sdk');

// Keep the booking engine usable in demo/offline mode.
// The route has a deterministic extractor fallback when an API key is not configured.
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

const SYSTEM_PROMPT = `You are RailBot, a friendly and efficient Indian railway ticket booking assistant.

Your job is to help users book train tickets through natural conversation.

CRITICAL RULES:
1. You MUST ALWAYS respond with ONLY valid JSON — no markdown fences, no extra text.
2. Never hallucinate train details. Train data is provided separately by the system.
3. Keep your "reply" field conversational, warm, and concise — like a helpful booking agent.
4. Ask for ONE missing field at a time. Never ask for multiple missing fields at once.
5. For confirmed bookings, always acknowledge warmly.
6. Support multiple bookings in a single message.

REQUIRED FIELDS for each booking:
source, destination, date, num_tickets

OPTIONAL FIELDS:
time_preference, travel_class

RESPONSE JSON SCHEMA:
{
  "intent": "book_ticket | select_train | confirm_booking | cancel_booking | check_pnr | book_food | other",
  "bookings": [
    {
      "booking_index": 0,
      "source": "string or null",
      "destination": "string or null",
      "date": "string or null",
      "time_preference": "morning | afternoon | evening | night | null",
      "num_tickets": "number or null",
      "travel_class": "string or null",
      "missing_fields": [],
      "is_complete": true
    }
  ],
  "selection": {
    "reference": "string",
    "booking_index": 0
  },
  "confirmation": false,
  "reply": "string"
}

INTENT GUIDE:
- book_ticket: User wants to book a ticket or provides booking information.
- select_train: User is choosing from train options shown.
- confirm_booking: User says yes, confirm, proceed, etc.
- cancel_booking: User wants to cancel.
- check_pnr: User wants to check a PNR.
- book_food: User EXPLICITLY asks to order, book or buy food/a meal for their
  journey (for example "order food", "I want food"). Only use this intent when
  the user asks for it directly — never infer it from a booking, a confirmation
  or a payment, and never suggest ordering food yourself.
- other: Greetings or unrelated questions.

IMPORTANT:
- Never invent train names, train numbers, timings, prices, availability, or PNR information.
- Ask for only ONE missing required field at a time.
- If multiple bookings exist, ask for the missing field for the first incomplete booking.
- If the user provides information for an existing booking, update that booking rather than creating a duplicate.
- Keep replies concise.

Today's date is: ${new Date().toDateString()}
Current time: ${new Date().toLocaleTimeString('en-IN', {
  timeZone: 'Asia/Kolkata'
})} IST`;

async function callLLM(conversationHistory) {
  if (!groq) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  const messages = [
    {
      role: 'system',
      content: SYSTEM_PROMPT
    },
    ...conversationHistory
  ];

  try {
    const response = await groq.chat.completions.create({
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.3,
      max_tokens: 512,
      response_format: {
        type: 'json_object'
      }
    });

    const content = response.choices[0].message.content;

    try {
      return JSON.parse(content);
    } catch (parseError) {
      const match = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);

      if (match) {
        return JSON.parse(match[1]);
      }

      throw new Error(
        'LLM returned non-JSON: ' + content.slice(0, 200)
      );
    }

  } catch (error) {
    if (error.status === 429) {
      throw new Error(
        'RailBot is temporarily busy. Please try again in a moment.'
      );
    }

    console.error('Groq API error:', error);
    throw error;
  }
}

module.exports = { callLLM };