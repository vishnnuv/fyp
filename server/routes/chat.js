const express = require('express');
const router = express.Router();
const { callLLM } = require('../services/llm');
const {
  searchTrains, isSupportedCity, parseTravelDate, routeExists, SUPPORTED_CITIES,
} = require('../services/trainSearch');
const { saveBooking, getBookingsByCustomer, getBookingByPNRForCustomer, cancelBooking } = require('../services/bookingStore');

// State is deliberately server-owned. In particular, trainOptions is the exact
// whitelist from which a later selection is allowed to resolve.
const sessions = new Map();
const REQUIRED_FIELDS = ['source', 'destination', 'date', 'num_tickets'];

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      conversationHistory: [], booking: {}, trainOptions: [],
      awaitingSelection: false, awaitingConfirmation: null, awaitingCancellation: null,
      availabilityCheck: false, awaitingField: null,
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
  const travelClass = value.match(/\b(sleeper|general|executive chair car|chair car|ac chair car|ac)\b/i);
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
  if (/\b(ac|air.?conditioned)\b/.test(text)) options.forEach(({ train }, index) => { if (train.classes.some((c) => /ac|chair/i.test(c.type) && c.seats_available > 0)) matches.add(index); });
  return [...matches];
}

function resolveSelectedClass(train, requestedClass) {
  const available = train.classes.filter((item) => item.seats_available > 0);
  if (!requestedClass) return available[0] || null;
  const requested = requestedClass.toLowerCase().trim();
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
    } else if (hasDraft && !pnr && wantsDraftCancellation(message)) {
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
        const { pnr, totalFare } = saveBooking({ sessionId, customerId: bookingCustomerId, trainNumber: train.train_number, trainName: train.train_name, source: booking.source, destination: booking.destination, travelDate: displayDate(booking.date), departureTime: train.departure_time, arrivalTime: train.arrival_time, travelClass: selectedClass.type, farePerTicket: selectedClass.fare, numTickets: booking.num_tickets });
        // The confirmed booking is persisted. Clear the in-progress draft so a
        // later "I want to book" message starts a fresh trip, not the old one.
        session.awaitingConfirmation = null; session.awaitingSelection = false;
        session.trainOptions = []; session.booking = {}; session.awaitingField = null;
        data = response('booking_confirmed', `🎉 Booking confirmed! Your PNR is **${pnr}**.`, { pnr, train, booking, selectedClass, numTickets: booking.num_tickets, totalFare, travelDate: displayDate(booking.date) });
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
      // continues the current booking as expected.
      if (isGreetingOrGeneralMessage) {
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

router.get('/bookings/:sessionId', (req, res) => {
  const { getBookingsBySession } = require('../services/bookingStore');
  res.json({ bookings: getBookingsBySession(req.params.sessionId) });
});

module.exports = router;
