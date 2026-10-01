const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm');
const {
  searchTrains, isSupportedCity, parseTravelDate, routeExists, classCategoryOf, getTrainByNumber, SUPPORTED_CITIES,
} = require('../services/trainSearch');
const { saveBooking, getBookingsByCustomer, getBookingByPNRForCustomer, cancelBooking } = require('../services/bookingStore');
const { createOrder, verifyPaymentSignature } = require('../services/payment');
const { saveFoodOrder, getFoodOrdersBySession } = require('../services/foodStore');
const { FOOD_MENU, parseSelectedItems } = require('../services/foodMenu');

// State is deliberately server-owned. In particular, trainOptions is the exact
// whitelist from which a later selection is allowed to resolve.
const sessions = new Map();
const REQUIRED_FIELDS = ['source', 'destination', 'date', 'num_tickets'];

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      conversationHistory: [], booking: {}, trainOptions: [],
      awaitingSelection: false, awaitingConfirmation: null, awaitingCancellation: null,
      awaitingField: null, availabilityCheck: false, pendingPayment: null, foodOrder: null,
    });
  }
  return sessions.get(sessionId);
}

function response(type, text, extra = {}) { return { type, text, ...extra }; }
function displayDate(value) {
  const parsed = parseTravelDate(value);
  return parsed ? parsed.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : value;
}
function stateLog(sessionId, session) {
  console.log(`[RailBot state] ${sessionId}`, JSON.stringify({
    booking: session.booking, optionNumbers: session.trainOptions.map((item) => item.train.train_number),
    awaitingSelection: session.awaitingSelection, awaitingConfirmation: Boolean(session.awaitingConfirmation),
    awaitingCancellation: Boolean(session.awaitingCancellation),
    pendingPayment: session.pendingPayment ? session.pendingPayment.orderId : null,
    foodStep: session.foodOrder ? session.foodOrder.step : null,
    awaitingField: session.awaitingField,
  }));
}

function pickBooking(result) {
  return result?.bookings?.find((item) => item && typeof item === 'object') || {};
}

// Covers common forms if the extraction provider is unavailable or omits a field.
function localExtraction(message) {
  const value = message.trim();
  const route = value.match(/(?:from|between)\s+([a-z][a-z .'-]*?)\s+(?:to|and)\s+([a-z][a-z .'-]*?)(?=\s+(?:on|for|tomorrow|today|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next)\b|[?.!,]|$)/i);
  const result = {};
  if (route) { result.source = route[1].trim(); result.destination = route[2].trim(); }
  const count = value.match(/(?:^|\s)(-?\d+)\s*(?:ticket|tickets)\b/i);
  if (count) result.num_tickets = Number(count[1]);
  const date = value.match(/\b(today|tomorrow|yesterday|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{1,2}-\d{1,2})\b/i);
  if (date) result.date = date[1];
  const time = value.match(/\b(morning|afternoon|evening|night)\b/i);
  if (time) result.time_preference = time[1].toLowerCase();
  const travelClass = value.match(/\b(non[\s-]?ac|sleeper|general|executive chair car|ac chair car|chair car|ac)\b/i);
  if (travelClass) result.travel_class = travelClass[1];
  return result;
}

function mergeBooking(session, extracted) {
  const fields = ['source', 'destination', 'date', 'num_tickets', 'time_preference', 'travel_class'];
  for (const field of fields) {
    if (extracted[field] !== undefined && extracted[field] !== null && extracted[field] !== '') session.booking[field] = extracted[field];
  }
}

function hasBookingData(booking) {
  return ['source', 'destination', 'date', 'num_tickets', 'time_preference', 'travel_class']
    .some((field) => booking[field] !== undefined && booking[field] !== null && booking[field] !== '');
}

function validateBooking(booking) {
  if (!booking.source) return { field: 'source', text: 'Which city are you travelling from?' };
  const source = isSupportedCity(booking.source);
  if (!source) return { field: 'source', text: `Sorry, ${booking.source} is not supported. Available cities are: ${SUPPORTED_CITIES.join(', ')}. Which source city would you like?` };
  booking.source = source;
  if (!booking.destination) return { field: 'destination', text: 'Which city would you like to travel to?' };
  const destination = isSupportedCity(booking.destination);
  if (!destination) return { field: 'destination', text: `Sorry, ${booking.destination} is not supported. Available cities are: ${SUPPORTED_CITIES.join(', ')}. Which destination city would you like?` };
  booking.destination = destination;
  if (source === destination) return { field: 'destination', text: 'Your source and destination cannot be the same city. Please provide a different destination.' };
  if (!booking.date) return { field: 'date', text: 'What date would you like to travel?' };
  const parsedDate = parseTravelDate(String(booking.date));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!parsedDate || parsedDate < today) return { field: 'date', text: 'Please provide a valid travel date that is today or in the future.' };
  if (!booking.num_tickets && booking.num_tickets !== 0) return { field: 'num_tickets', text: 'How many tickets would you like to book? (1–6)' };
  const count = Number(booking.num_tickets);
  if (!Number.isInteger(count) || count < 1 || count > 6) return { field: 'num_tickets', text: 'Please enter a whole number of tickets from 1 to 6.' };
  booking.num_tickets = count;
  return null;
}

function optionsResponse(session) {
  const booking = session.booking;
  const trains = searchTrains(booking);
  if (!trains.length) return response('text', `Sorry, I couldn't find trains from **${booking.source}** to **${booking.destination}** on **${displayDate(booking.date)}**. Would you like to try another date?`);
  session.trainOptions = trains.map((train, index) => ({ train, booking: { ...booking }, optionNumber: index + 1 }));
  session.awaitingSelection = true;
  return response('train_options', `Here are the available trains. Please select an **Option number**, train name, train number, or a detail such as “the morning one”.`, { trains, booking: { ...booking }, numTickets: booking.num_tickets });
}

function selectionMatches(message, options) {
  const text = message.toLowerCase().trim();
  // An explicit option number is intentional and must take precedence over
  // words in the train name (for example, several Chennai options contain
  // "Mysuru", which previously made a card click look ambiguous).
  const optionNumber = text.match(/\boption\s*(\d+)\b/);
  if (optionNumber && Number(optionNumber[1]) >= 1 && Number(optionNumber[1]) <= options.length) {
    return [Number(optionNumber[1]) - 1];
  }

  // Train numbers are also exact identifiers among the displayed options.
  const trainNumberMatches = options
    .map(({ train }, index) => (new RegExp(`\\b${train.train_number}\\b`).test(text) ? index : -1))
    .filter((index) => index !== -1);
  if (trainNumberMatches.length) return trainNumberMatches;

  const matches = new Set();
  const ordinal = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4 };
  Object.entries(ordinal).forEach(([word, index]) => { if (new RegExp(`\\b${word}\\b`).test(text) && index < options.length) matches.add(index); });
  options.forEach(({ train }, index) => {
    if (text.includes(train.train_name.toLowerCase())) matches.add(index);
    const significant = train.train_name.toLowerCase().split(/\s+/).filter((word) => word.length > 4 && !['express', 'train'].includes(word));
    if (significant.some((word) => text.includes(word))) matches.add(index);
  });
  if (/\b(morning|earliest)\b/.test(text)) {
    const earliest = Math.min(...options.map(({ train }) => Number(train.departure_time.replace(':', ''))));
    options.forEach(({ train }, index) => { if (Number(train.departure_time.replace(':', '')) === earliest) matches.add(index); });
  }
  if (/\b(cheapest|cheaper)\b/.test(text)) {
    const fares = options.map(({ train }) => Math.min(...train.classes.filter((c) => c.seats_available > 0).map((c) => c.fare)));
    const lowest = Math.min(...fares); fares.forEach((fare, index) => { if (fare === lowest) matches.add(index); });
  }
  // "the AC one" / "the non-AC one" resolve through the normalized category so
  // every AC class type (Chair Car, Executive Chair Car, ...) counts.
  if (/\b(ac|a\/c|air.?conditioned)\b/.test(text) && !/\bnon[\s-]?ac\b/.test(text)) {
    options.forEach(({ train }, index) => {
      if (train.classes.some((c) => c.category === 'AC' && c.seats_available > 0)) matches.add(index);
    });
  }
  if (/\bnon[\s-]?ac\b/.test(text)) {
    options.forEach(({ train }, index) => {
      if (train.classes.some((c) => c.category === 'Non-AC' && c.seats_available > 0)) matches.add(index);
    });
  }
  return [...matches];
}

function resolveSelectedClass(train, requestedClass) {
  const available = train.classes.filter((item) => item.seats_available > 0);
  if (!requestedClass) return available[0] || null;
  const requested = requestedClass.toLowerCase().trim();
  // "AC" / "non-AC" wording selects by the normalized category; concrete names
  // (Sleeper, Chair Car, ...) still select that exact class type.
  const category = classCategoryOf(requested);
  if (category) return available.find((item) => item.category === category) || null;
  return available.find((item) => item.type.toLowerCase() === requested)
    || available.find((item) => item.type.toLowerCase().includes(requested))
    || available.find((item) => requested.includes(item.type.toLowerCase()))
    || null;
}

function listOptions(session) {
  return session.trainOptions.map(({ train }, index) => `Option ${index + 1}: ${train.train_number} ${train.train_name} (${train.departure_time})`).join('\n');
}

function isYes(message) { return /\b(yes|yeah|yep|confirm|proceed|book it|go ahead)\b/i.test(message); }
function isNo(message) { return /\b(no|nope|cancel|don't|do not|change|other options|another)\b/i.test(message); }
function wantsAvailability(message) { return /\b(is there|are there|availability|available)\b/i.test(message) && !/\bbook(?:ing)?\b/i.test(message); }
function extractPNR(message) { return message.match(/\bPNR\d{7}\b/i)?.[0]?.toUpperCase() || null; }
function wantsCancellation(message) { return /\b(cancel|cancellation)\b/i.test(message); }
function wantsBookingLookup(message) { return /\b(my bookings?|show (?:my )?bookings?|list (?:my )?bookings?|check (?:my )?pnr|booking status|status.*pnr)\b/i.test(message); }
function wantsDraftCancellation(message) { return /\b(cancel|stop|abort)\b/i.test(message); }
function extractBookingChange(message, awaitingField) {
  const rules = [
    ['source', /\b(?:change|update|modify)\s+(?:the\s+)?(?:source|from)\s+(?:to\s+)?(.+)$/i],
    ['destination', /\b(?:change|update|modify)\s+(?:the\s+)?(?:destination|to)\s+(?:to\s+)?(.+)$/i],
    ['date', /\b(?:change|update|modify)\s+(?:the\s+)?date\s+(?:to\s+)?(.+)$/i],
    ['num_tickets', /\b(?:change|update|modify)\s+(?:the\s+)?(?:tickets?|passengers?|count)\s+(?:to\s+)?(-?\d+)\b/i],
    ['travel_class', /\b(?:change|update|modify)\s+(?:the\s+)?class\s+(?:to\s+)?(.+)$/i],
    ['time_preference', /\b(?:change|update|modify)\s+(?:the\s+)?(?:time|time preference)\s+(?:to\s+)?(.+)$/i],
  ];
  for (const [field, pattern] of rules) {
    const match = message.match(pattern);
    if (match) return { field, value: field === 'num_tickets' ? Number(match[1]) : match[1].trim() };
  }
  if (awaitingField) {
    const match = message.match(/\b(?:change|update|modify)\s+(?:it|that)\s+(?:to\s+)?(.+)$/i);
    if (match) return { field: awaitingField, value: awaitingField === 'num_tickets' ? Number(match[1]) : match[1].trim() };
  }
  return null;
}
function formatBooking(booking) {
  return `**${booking.pnr}** — ${booking.train_name} (${booking.train_number})\n${booking.source} → ${booking.destination} on ${booking.travel_date}, ${booking.departure_time}\n${booking.travel_class}, ${booking.num_tickets} ticket(s), ₹${booking.total_fare} — **${booking.status}**`;
}

// --- Razorpay payment -------------------------------------------------------
// Confirming a booking creates a Razorpay order first; the ticket is only
// persisted after the client returns a payment signature we can verify.

function pendingPaymentResponse(pending) {
  return response('payment_required',
    `Opening **Razorpay checkout** for **₹${pending.totalFare}** (test mode) — ${pending.train.train_name}, ${pending.travelDate}. Your ticket is issued only after the payment succeeds.`,
    {
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: pending.orderId,
      amount: pending.totalFare * 100,
      currency: 'INR',
      trainName: pending.train.train_name,
      source: pending.booking.source,
      destination: pending.booking.destination,
      travelDate: pending.travelDate,
      numTickets: pending.booking.num_tickets,
      totalFare: pending.totalFare,
    });
}

async function ensurePaymentOrder(sessionId, session) {
  const pending = session.pendingPayment;
  if (pending.orderId) return pending.orderId;
  const order = await createOrder({
    amountPaise: pending.totalFare * 100,
    receipt: `railbot_${sessionId}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40),
    notes: {
      sessionId,
      route: `${pending.booking.source}-${pending.booking.destination}`,
      travelDate: String(pending.booking.date),
    },
  });
  pending.orderId = order.id;
  return order.id;
}

function confirmationFrom(pending) {
  return { train: pending.train, booking: pending.booking, selectedClass: pending.selectedClass };
}

// --- Food ordering ---------------------------------------------------------
// A separate intent that is only ever started by an explicit request — it is
// never chained after a ticket booking, confirmation or payment.

function isFoodRequest(message) {
  const value = String(message || '').trim();
  if (!value) return false;
  // Cancellation wording is never a fresh request (handled by the active step).
  if (/^\s*(?:cancel|abort|stop|never\s*mind)\b/i.test(value)) return false;
  const FOOD_WORD = '(?:food|meal|lunch|dinner|breakfast|snacks?|refreshments?)';
  const VERB = '(?:order|book|want|need|get|buy|request|place|grab|have)';
  return new RegExp(`\\b${VERB}\\b[^.?!]{0,45}\\b${FOOD_WORD}\\b`, 'i').test(value)
    || new RegExp(`\\b${FOOD_WORD}s?\\s+(?:order|delivery|for my|onboard)\\b`, 'i').test(value);
}

function foodBookingCard(booking) {
  return {
    pnr: booking.pnr, train_number: booking.train_number, train_name: booking.train_name,
    source: booking.source, destination: booking.destination, travel_date: booking.travel_date,
    departure_time: booking.departure_time, travel_class: booking.travel_class,
    num_tickets: booking.num_tickets, total_fare: booking.total_fare, status: booking.status,
  };
}

const ORDINALS = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5, seventh: 6, eighth: 7 };

function ordinalIndex(text) {
  const found = Object.entries(ORDINALS).find(([word]) => new RegExp(`\\b${word}\\b`).test(text));
  return found ? found[1] : -1;
}

function pickBookingFromList(message, bookings) {
  const pnr = extractPNR(message);
  if (pnr) return bookings.find((item) => item.pnr === pnr) || null;

  const text = String(message).toLowerCase();
  const ordinal = ordinalIndex(text);
  if (ordinal >= 0 && ordinal < bookings.length) return bookings[ordinal];

  const number = text.match(/\b(?:option|booking|select|pnr|#)?\s*(\d{1,2})\b/);
  if (number) {
    const index = Number(number[1]) - 1;
    return index >= 0 && index < bookings.length ? bookings[index] : null;
  }
  return bookings.find((item) => text.includes(String(item.train_name).toLowerCase())) || null;
}

function pickStopFromList(message, stops) {
  const text = String(message).toLowerCase();
  const ordinal = ordinalIndex(text);
  if (ordinal >= 0 && ordinal < stops.length) return stops[ordinal];

  const number = text.match(/\b(?:stop|option|station|select|#)?\s*(\d{1,2})\b/);
  if (number) {
    const index = Number(number[1]) - 1;
    return index >= 0 && index < stops.length ? stops[index] : null;
  }
  return stops.find((stop) => text.includes(String(stop.station).toLowerCase())) || null;
}

function foodMenuPayload(food) {
  return {
    menu: FOOD_MENU,
    booking: foodBookingCard(food.booking),
    stop: food.stop,
    selectedKeys: food.items.map((item) => item.key),
  };
}

function foodSummaryPayload(food) {
  const total = food.items.reduce((sum, item) => sum + item.price, 0);
  return {
    pnr: food.booking.pnr,
    trainNumber: food.booking.train_number,
    trainName: food.booking.train_name,
    station: food.stop.station,
    arrivalTime: food.stop.arrival_time,
    items: food.items,
    total,
  };
}

async function handleFoodFlow({ sessionId, session, customerId, message }) {
  const food = session.foodOrder;

  // Step 1 — no flow yet: list the customer's confirmed bookings.
  if (!food) {
    const bookings = getBookingsByCustomer(customerId).filter((item) => item.status === 'CONFIRMED');
    if (!bookings.length) {
      return response('text', "I couldn't find any confirmed bookings, so I can't place a food order yet. Please book a ticket first, then ask me again to order food.");
    }
    session.foodOrder = { step: 'select_booking', bookings, booking: null, stop: null, items: [] };
    return response('food_bookings',
      `You have **${bookings.length} confirmed booking${bookings.length > 1 ? 's' : ''}**. Which one is this food order for?\nPick a booking below, or reply **"cancel food order"** to stop.`,
      { bookings: bookings.map(foodBookingCard) });
  }

  // Cancelling only ever clears the food order — tickets are untouched.
  if (/\b(cancel|abort|quit|never\s*mind)\b/i.test(message) || /^stop\b/i.test(message)) {
    session.foodOrder = null;
    return response('text', 'Food order cancelled — nothing was charged and your tickets are unaffected. Ask me any time to order food.');
  }

  // Step 1b — the booking is chosen: show that train's delivery stops.
  if (food.step === 'select_booking') {
    const booking = pickBookingFromList(message, food.bookings);
    if (!booking) {
      return response('food_bookings', `I couldn't match that to one of your bookings. Please pick one of these:`, { bookings: food.bookings.map(foodBookingCard) });
    }
    const train = getTrainByNumber(booking.train_number);
    const stops = train?.route_stops || [];
    if (!stops.length) {
      session.foodOrder = null;
      return response('text', `Sorry, I don't have stop information for **${booking.train_name}**, so delivery can't be arranged on that train.`);
    }
    food.booking = booking;
    food.step = 'select_stop';
    return response('food_stops',
      `Food for **${booking.pnr}** — **${booking.train_name}** (${booking.source} → ${booking.destination}).\nWhere should we deliver it? Choose a stop:`,
      { booking: foodBookingCard(booking), stops });
  }

  // Step 2 — delivery stop chosen: show the menu.
  if (food.step === 'select_stop') {
    const stops = getTrainByNumber(food.booking.train_number)?.route_stops || [];
    const stop = pickStopFromList(message, stops);
    if (!stop) {
      return response('food_stops', `Please choose one of these delivery stops:`, { booking: foodBookingCard(food.booking), stops });
    }
    food.stop = stop;
    food.step = 'select_items';
    return response('food_menu',
      `Delivery at **${stop.station}** (arrives ${stop.arrival_time}). Here is the menu — select the items you'd like:`,
      foodMenuPayload(food));
  }

  // Step 3 — menu chosen: build the summary.
  if (food.step === 'select_items') {
    const picks = parseSelectedItems(message);
    if (!picks.length) {
      return response('food_menu',
        `Please select at least one item — you can tick items and press **Add to order**, or type something like *"1 and 4"* or *"veg meal and tea"*:`,
        foodMenuPayload(food));
    }
    food.items = picks.map((index) => FOOD_MENU[index]);
    food.step = 'confirm';
    return response('food_summary', `Here is your order summary. Shall I place it?`, foodSummaryPayload(food));
  }

  // Step 4 — explicit confirmation before anything is saved.
  if (food.step === 'confirm') {
    if (isYes(message) || /\b(confirm|place(?:\s+the)?\s+order)\b/i.test(message)) {
      const summary = foodSummaryPayload(food);
      const { orderId } = saveFoodOrder({
        pnr: summary.pnr,
        station: summary.station,
        items: summary.items,
        total: summary.total,
        sessionId,
        customerId,
        trainNumber: summary.trainNumber,
        trainName: summary.trainName,
      });
      session.foodOrder = null;
      return response('food_confirmed',
        `🎉 Food order **${orderId}** placed for PNR **${summary.pnr}**!\n**${summary.station}** — ${summary.items.map((item) => item.name).join(', ')} — **₹${summary.total}**.`,
        { orderId, ...summary });
    }
    if (isNo(message)) {
      food.items = [];
      food.step = 'select_items';
      return response('food_menu', `No problem — pick your items again:`, foodMenuPayload(food));
    }
    return response('food_summary', `Please reply **"yes"** to place this order or **"no"** to change your selection:`, foodSummaryPayload(food));
  }

  session.foodOrder = null;
  return response('text', 'Food ordering restarted. What would you like to order?');
}

router.post('/', async (req, res) => {
  try {
    const { message, sessionId, customerId } = req.body;
    if (!message || !sessionId) return res.status(400).json({ error: 'message and sessionId are required' });
    const session = getSession(sessionId);
    // customerId stays the same across refreshes; sessionId only identifies
    // the current conversation. Older clients fall back to sessionId.
    const bookingCustomerId = customerId || sessionId;
    session.conversationHistory.push({ role: 'user', content: message });
    let data;
    const pnr = extractPNR(message);
    const hasDraft = session.awaitingConfirmation || session.awaitingSelection || session.awaitingField || hasBookingData(session.booking);
    const requestedChange = extractBookingChange(message, session.awaitingField);

    // Draft controls take precedence over stored-booking commands. They never
    // modify a persisted booking until the user explicitly confirms it.
    if (session.awaitingCancellation) {
      const pendingCancellation = session.awaitingCancellation;
      if (isYes(message)) {
        const cancellation = cancelBooking(pendingCancellation.pnr, bookingCustomerId);
        session.awaitingCancellation = null;
        data = response('text', cancellation
          ? `Your booking has been cancelled.\n\n${formatBooking(cancellation.booking)}`
          : `I could not find ${pendingCancellation.pnr} anymore.`);
      } else if (isNo(message)) {
        session.awaitingCancellation = null;
        data = response('text', `Okay, ${pendingCancellation.pnr} remains confirmed.`);
      } else {
        data = response('text', `Please reply yes to cancel ${pendingCancellation.pnr}, or no to keep it.`);
      }
    }

    // A Razorpay checkout is open for this session. Every message is resolved
    // against that pending order until it succeeds or is abandoned.
    else if (session.pendingPayment) {
      const pending = session.pendingPayment;
      if (/^payment failed/i.test(message)) {
        const reason = message.replace(/^payment failed[:\s]*/i, '').trim();
        data = response('text', `The payment could not be completed${reason && reason !== message ? ` (${reason})` : ''}. No money was captured and no ticket was created.\n\nReply **"retry payment"** to try again, or **"cancel payment"** to stop.`);
      } else if (isYes(message) || /\b(retry|again|resume|pay)\b/i.test(message)) {
        try {
          await ensurePaymentOrder(sessionId, session);
          data = pendingPaymentResponse(pending);
        } catch (error) {
          console.error('Razorpay order creation failed:', error.message);
          data = response('text', `I could not start the Razorpay checkout: ${error.message}. Reply **"retry payment"** to try again.`);
        }
      } else if (isNo(message) || /\b(cancel|abort|stop|quit)\w*\b/i.test(message)) {
        session.pendingPayment = null;
        session.awaitingConfirmation = confirmationFrom(pending);
        data = response('text', `Payment cancelled — no money was taken and no ticket was created.\n\nReply **"yes"** to try paying for **${pending.train.train_name}** again, or **"no"** to choose a different train.`);
      } else {
        data = response('text', `A payment of **₹${pending.totalFare}** for **${pending.train.train_name}** is still pending. Reply **"retry payment"** to continue, or **"cancel payment"** to stop.`);
      }
    }

    // The food flow is an independent intent: it starts only on an explicit
    // request and leaves any in-progress ticket booking untouched.
    else if (session.foodOrder || isFoodRequest(message)) {
      data = await handleFoodFlow({ sessionId, session, customerId: bookingCustomerId, message });
    }

    else if (hasDraft && !pnr && wantsDraftCancellation(message)) {
      session.booking = {}; session.trainOptions = []; session.awaitingSelection = false;
      session.awaitingConfirmation = null; session.awaitingField = null; session.availabilityCheck = false;
      data = response('text', 'Your current booking process has been cancelled. No ticket was created.');
    } else if (hasDraft && requestedChange) {
      session.booking[requestedChange.field] = requestedChange.value;
      session.trainOptions = []; session.awaitingSelection = false; session.awaitingConfirmation = null;
      const issue = validateBooking(session.booking);
      session.awaitingField = issue?.field || null;
      data = issue ? response('text', issue.text) : optionsResponse(session);
    }

    // Booking records are tied to the current customer profile. These commands
    // bypass the LLM so lookup/cancellation remains reliable and cannot act
    // on an invented PNR.
    else if (!session.awaitingConfirmation && !session.awaitingSelection && wantsCancellation(message)) {
      if (!pnr) {
        data = response('text', 'Please provide the PNR you want to cancel, for example: “Cancel PNR1234567”.');
      } else {
        const booking = getBookingByPNRForCustomer(pnr, bookingCustomerId);
        if (!booking) data = response('text', `I could not find ${pnr} in your saved bookings.`);
        else if (booking.status === 'CANCELLED') data = response('text', `${pnr} is already cancelled.`);
        else {
          session.awaitingCancellation = { pnr };
          data = response('text', `Are you sure you want to cancel this booking?\n\n${formatBooking(booking)}\n\nReply yes to cancel or no to keep it.`);
        }
      }
    } else if (!session.awaitingConfirmation && !session.awaitingSelection && (wantsBookingLookup(message) || pnr)) {
      if (pnr) {
        const booking = getBookingByPNRForCustomer(pnr, bookingCustomerId);
        data = booking
          ? response('text', `Here is your booking:\n\n${formatBooking(booking)}`)
          : response('text', `I could not find ${pnr} in this chat session.`);
      } else {
        const bookings = getBookingsByCustomer(bookingCustomerId);
        data = bookings.length
          ? response('booking_list', 'Here are your saved bookings:', { bookings })
          : response('text', 'You do not have any saved bookings yet.');
      }
    }

    // These two states have precedence: user input must be resolved against state,
    // never against a model-proposed train.
    else if (session.awaitingConfirmation) {
      if (isYes(message)) {
        const { train, booking, selectedClass } = session.awaitingConfirmation;
        const totalFare = selectedClass.fare * booking.num_tickets;
        const travelDate = displayDate(booking.date);
        // Create the Razorpay order first; the booking row is written only
        // after the signature comes back verified from /payment/verify.
        session.pendingPayment = {
          train, booking: { ...booking }, selectedClass, orderId: null, totalFare, travelDate,
        };
        try {
          await ensurePaymentOrder(sessionId, session);
          session.awaitingConfirmation = null;
          data = pendingPaymentResponse(session.pendingPayment);
        } catch (error) {
          console.error('Razorpay order creation failed:', error.message);
          session.pendingPayment = null;
          data = response('text', `I could not start the Razorpay checkout: ${error.message}. Please reply "yes" to try again.`);
        }
      } else if (isNo(message)) {
        session.awaitingConfirmation = null;
        if (/date/i.test(message)) { delete session.booking.date; data = response('text', 'No problem—what new travel date would you like?'); }
        else { session.awaitingSelection = true; data = response('train_options', `No problem. Here are the same options again:\n${listOptions(session)}`, { trains: session.trainOptions.map((item) => item.train), booking: session.booking, numTickets: session.booking.num_tickets }); }
      } else data = response('text', 'Please reply “yes” to confirm this booking or “no” to change it.');
    } else if (session.awaitingSelection) {
      const matches = selectionMatches(message, session.trainOptions);
      if (matches.length !== 1) {
        const text = matches.length > 1 ? `I found more than one possible match. Please choose one:\n${matches.map((index) => `Option ${index + 1}: ${session.trainOptions[index].train.train_number} ${session.trainOptions[index].train.train_name} (${session.trainOptions[index].train.departure_time})`).join('\n')}` : `I couldn't match that to a displayed option. Please choose one of these:\n${listOptions(session)}`;
        data = response('train_options', text, { trains: session.trainOptions.map((item) => item.train), booking: session.booking, numTickets: session.booking.num_tickets });
      } else {
        const selected = session.trainOptions[matches[0]];
        const requestedClass = localExtraction(message).travel_class || selected.booking.travel_class;
        const selectedClass = resolveSelectedClass(selected.train, requestedClass);
        if (!selectedClass) {
          const available = selected.train.classes.filter((item) => item.seats_available > 0).map((item) => item.type).join(', ');
          data = response('text', requestedClass ? `${requestedClass} is not available on ${selected.train.train_name}. Available classes: ${available}. Please choose an available class.` : 'That train has no available seats. Please choose another option.');
        }
        else {
          session.awaitingSelection = false; session.awaitingConfirmation = { ...selected, selectedClass };
          const totalFare = selectedClass.fare * selected.booking.num_tickets;
          data = response('text', `You selected **${selected.train.train_name}** (${selected.train.train_number}) on **${displayDate(selected.booking.date)}**, departing **${selected.train.departure_time}**. Class: **${selectedClass.type}**. Fare: **₹${selectedClass.fare} × ${selected.booking.num_tickets} = ₹${totalFare}**. Shall I confirm this booking?`);
        }
      }
    } else {
      let llmResult = {};
      try { llmResult = await callLLM(session.conversationHistory); } catch (error) { console.warn('LLM extraction unavailable; using local extraction:', error.message); }
      const extracted = { ...pickBooking(llmResult), ...localExtraction(message) };
      const isGreetingOrGeneralMessage = llmResult.intent === 'other'
        && !hasBookingData(extracted)
        && !session.awaitingField
        && !session.availabilityCheck;

      // Do not force greetings and unrelated messages into the booking form.
      // A pending field still takes priority, so a reply such as "Chennai"
      // continues the current booking as expected. The model can also flag the
      // explicit food intent (the route's regex check usually catches it first).
      if (llmResult.intent === 'book_food') {
        data = await handleFoodFlow({ sessionId, session, customerId: bookingCustomerId, message });
      } else if (isGreetingOrGeneralMessage) {
        data = response('text', llmResult.reply || 'Hi! How can I help you book a train today?');
      } else {
      // A short answer to a one-at-a-time prompt is contextual data, not a new intent.
      if (session.awaitingField && extracted[session.awaitingField] === undefined) {
        if (session.awaitingField === 'num_tickets' && /^-?\d+$/.test(message.trim())) extracted.num_tickets = Number(message.trim());
        else if (session.awaitingField === 'date') extracted.date = message.trim();
        else if (session.awaitingField === 'source' || session.awaitingField === 'destination') extracted[session.awaitingField] = message.trim();
      }
      const availability = session.availabilityCheck || wantsAvailability(message) || llmResult.intent === 'check_availability';
      mergeBooking(session, extracted);
      if (availability) {
        session.availabilityCheck = true;
        const source = isSupportedCity(session.booking.source);
        const destination = isSupportedCity(session.booking.destination);
        if (!source || !destination) {
          // For a fully stated availability route, report that it is unavailable
          // instead of turning it into a booking interview.
          if (session.booking.source && session.booking.destination) {
            session.availabilityCheck = false;
            data = response('text', `Sorry, there are no trains available from ${session.booking.source} to ${session.booking.destination}. Supported cities are: ${SUPPORTED_CITIES.join(', ')}.`);
          } else { session.awaitingField = !source ? 'source' : 'destination'; data = response('text', `I can check that. Available cities are: ${SUPPORTED_CITIES.join(', ')}. Please tell me both source and destination.`); }
        }
        else if (source === destination) { session.awaitingField = 'destination'; data = response('text', 'Your source and destination cannot be the same city. Please provide a different destination.'); }
        else if (!routeExists(source, destination)) { session.availabilityCheck = false; data = response('text', `Sorry, there are no trains available from ${source} to ${destination}.`); }
        else if (!session.booking.date) { session.awaitingField = 'date'; data = response('text', `Yes, there are trains from ${source} to ${destination}. Which date would you like to travel?`); }
        else {
          // Availability becomes a booking search once the user supplies a date;
          // a ticket count is not needed just to show options.
          session.booking.source = source; session.booking.destination = destination; session.booking.num_tickets ||= 1; session.awaitingField = null; session.availabilityCheck = false;
          data = optionsResponse(session);
        }
      } else {
        const issue = validateBooking(session.booking);
        session.awaitingField = issue?.field || null;
        data = issue ? response('text', issue.text) : optionsResponse(session);
      }
      }
    }

    stateLog(sessionId, session);
    session.conversationHistory.push({ role: 'assistant', content: data.text });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Chat route error:', error);
    return res.status(500).json({ success: false, error: 'An internal error occurred. Please try again.' });
  }
});

// Payment verification happens server-to-server state: the client only relays
// what Razorpay returned; the signature proves it came from Razorpay.
router.post('/payment/verify', async (req, res) => {
  try {
    const { sessionId, customerId, razorpay_order_id, razorpay_payment_id, razorpay_signature, method } = req.body;
    if (!sessionId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: 'sessionId and the Razorpay payment fields are required.' });
    }
    const session = sessions.get(sessionId);
    const bookingCustomerId = customerId || sessionId;
    if (!session || !session.pendingPayment) {
      return res.status(400).json({ success: false, error: 'There is no pending payment for this session. Please start the booking again.' });
    }
    const pending = session.pendingPayment;
    if (razorpay_order_id !== pending.orderId) {
      return res.status(400).json({ success: false, error: 'This payment does not match your pending booking.' });
    }

    const valid = verifyPaymentSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      // Keep the pending payment so the user can retry from the chat.
      return res.status(400).json({ success: false, error: 'Payment signature verification failed. Your booking was not created — please reply “retry payment”.' });
    }

    const { train, booking, selectedClass, totalFare, travelDate } = pending;
    const { pnr } = saveBooking({
      sessionId,
      customerId: bookingCustomerId,
      trainNumber: train.train_number,
      trainName: train.train_name,
      source: booking.source,
      destination: booking.destination,
      travelDate,
      departureTime: train.departure_time,
      arrivalTime: train.arrival_time,
      travelClass: selectedClass.type,
      farePerTicket: selectedClass.fare,
      numTickets: booking.num_tickets,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      paymentMethod: method || null,
    });

    // The confirmed booking is persisted. Clear the in-progress draft so a
    // later "I want to book" message starts a fresh trip, not the old one.
    session.pendingPayment = null;
    session.awaitingConfirmation = null;
    session.awaitingSelection = false;
    session.trainOptions = [];
    session.booking = {};
    session.awaitingField = null;
    session.availabilityCheck = false;

    const data = response('booking_confirmed',
      `🎉 Booking confirmed! Your PNR is **${pnr}**. Payment of **₹${totalFare}** received via Razorpay (test mode).`,
      {
        pnr, train, booking, selectedClass,
        numTickets: booking.num_tickets, totalFare, travelDate,
        paymentId: razorpay_payment_id, paymentMethod: method || null,
      });
    session.conversationHistory.push({ role: 'assistant', content: data.text });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('Payment verification error:', error);
    return res.status(500).json({ success: false, error: 'Payment verification failed. Please try again.' });
  }
});

router.get('/bookings/:sessionId', (req, res) => {
  const { getBookingsBySession } = require('../services/bookingStore');
  res.json({ bookings: getBookingsBySession(req.params.sessionId) });
});

router.get('/food-orders/:sessionId', (req, res) => {
  res.json({ orders: getFoodOrdersBySession(req.params.sessionId) });
});

module.exports = router;
