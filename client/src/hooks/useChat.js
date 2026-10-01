import { useState, useCallback, useEffect, useRef } from 'react';

// Generate a stable session ID per browser session
const SESSION_ID = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const CUSTOMER_ID_KEY = 'railbot_customer_id';

function getCustomerId() {
  let customerId = window.localStorage.getItem(CUSTOMER_ID_KEY);
  if (!customerId) {
    customerId = `guest_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`}`;
    window.localStorage.setItem(CUSTOMER_ID_KEY, customerId);
  }
  return customerId;
}

const CUSTOMER_ID = getCustomerId();

// Opens Razorpay checkout and resolves with the outcome.
// - success: Razorpay returned order/payment/signature for server verification
// - failed:  the customer's payment attempt failed (error description kept)
// - cancelled: the customer closed the checkout without paying
function openRazorpayCheckout(payment) {
  return new Promise((resolve) => {
    if (typeof window.Razorpay !== 'function') {
      resolve({ status: 'failed', error: 'Razorpay checkout could not be loaded (check your connection)' });
      return;
    }

    let settled = false;
    let failureError = null;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const checkout = new window.Razorpay({
      key: payment.keyId,
      amount: payment.amount,
      currency: payment.currency || 'INR',
      order_id: payment.orderId,
      name: 'RailBot',
      description: `${payment.numTickets} ticket(s) — ${payment.trainName} · ${payment.travelDate}`,
      notes: { sessionId: SESSION_ID, customerId: CUSTOMER_ID },
      theme: { color: '#2563eb' },
      prefill: { name: 'RailBot Traveller' },
      handler: (response) => {
        settle({
          status: 'success',
          response: {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            method: response.method,
          },
        });
      },
      modal: {
        // Fires when the customer closes the checkout (also after a failure
        // they dismiss), so this is the single "not paid" exit point.
        ondismiss: () => settle(
          failureError
            ? { status: 'failed', error: failureError }
            : { status: 'cancelled' },
        ),
      },
    });

    checkout.on('payment.failed', (response) => {
      // Remember the reason but let the customer retry inside the still-open
      // modal; we only settle once the modal is closed or a payment succeeds.
      failureError = response?.error?.description || 'payment failed';
    });

    checkout.open();
  });
}

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  // Train-card click handler, so option cards inside a message can reply.
  const selectTrainRef = useRef(null);
  // Callbacks handed to the food-ordering widgets (booking list, stop
  // dropdown, menu checkboxes, summary buttons). The object is created once
  // because each food message embeds it when the message is added — while a
  // request is still in flight. Its methods therefore call through
  // sendMessageRef, so they always reach the *current* sendMessage instead of
  // a stale closure whose isLoading guard would silently drop the click.
  const sendMessageRef = useRef(null);
  const foodActionsRef = useRef(null);
  if (foodActionsRef.current === null) {
    foodActionsRef.current = {
      selectBooking: (index) => { sendMessageRef.current?.(`select booking ${index + 1}`); },
      selectStop: (index) => { sendMessageRef.current?.(`select stop ${index + 1}`); },
      submitItems: (indices) => { sendMessageRef.current?.(`food items: ${indices.map((index) => index + 1).join(',')}`); },
      confirmOrder: () => { sendMessageRef.current?.('confirm food order'); },
      changeItems: () => { sendMessageRef.current?.('no'); },
      cancelOrder: () => { sendMessageRef.current?.('cancel food order'); },
    };
  }

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), timestamp: new Date(), ...msg }]);
  }, []);

  const postChat = useCallback(async (text) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: SESSION_ID, customerId: CUSTOMER_ID }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }

    const result = await response.json();
    return result.data;
  }, []);

  // Sends the Razorpay payload back for server-side signature verification.
  // The booking/PNR only exists if the signature checks out.
  const verifyPayment = useCallback(async (payment) => {
    let payload;
    let response;
    try {
      response = await fetch('/api/chat/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: SESSION_ID, customerId: CUSTOMER_ID, ...payment.response }),
      });
      payload = await response.json().catch(() => ({}));
    } catch (error) {
      addMessage({
        role: 'bot',
        type: 'text',
        text: `⚠️ Could not reach the server to verify your payment: ${error.message}. Please reply “retry payment”.`,
      });
      return;
    }

    if (!response.ok || !payload.success) {
      addMessage({
        role: 'bot',
        type: 'text',
        text: `⚠️ ${payload.error || 'Payment verification failed.'}`,
      });
      return;
    }

    addMessage({ role: 'bot', type: 'booking_confirmed', ...payload.data });
  }, [addMessage]);

  const presentData = useCallback(async (data) => {
    if (data.type === 'train_options') {
      addMessage({
        role: 'bot',
        type: 'train_options',
        text: data.text,
        trains: data.trains,
        booking: data.booking,
        numTickets: data.numTickets,
        onSelectTrain: selectTrainRef.current,
      });
    } else if (data.type === 'booking_list') {
      addMessage({
        role: 'bot',
        type: 'booking_list',
        text: data.text,
        bookings: data.bookings,
      });
    } else if (data.type === 'booking_confirmed') {
      addMessage({
        role: 'bot',
        type: 'booking_confirmed',
        text: data.text,
        pnr: data.pnr,
        train: data.train,
        booking: data.booking,
        selectedClass: data.selectedClass,
        numTickets: data.numTickets,
        totalFare: data.totalFare,
        travelDate: data.travelDate,
        paymentId: data.paymentId,
        paymentMethod: data.paymentMethod,
      });
      // If there's a follow-up booking, show that prompt too
      if (data.nextBookingPrompt) {
        setTimeout(() => {
          addMessage({ role: 'bot', type: 'text', text: data.nextBookingPrompt });
        }, 800);
      }
    } else if (data.type === 'payment_required') {
      // Bot explains the charge, then Razorpay checkout takes over.
      addMessage({ role: 'bot', type: 'text', text: data.text });
      const payment = await openRazorpayCheckout(data);
      if (payment.status === 'success') {
        await verifyPayment(payment);
      } else {
        // Keep the server's pending-payment state in sync with the modal.
        const followUp = payment.status === 'failed'
          ? `payment failed: ${payment.error}`
          : 'payment cancelled';
        try {
          const next = await postChat(followUp);
          await presentData(next);
        } catch (error) {
          addMessage({ role: 'bot', type: 'text', text: `⚠️ Sorry, something went wrong: ${error.message}. Please try again.` });
        }
      }
    } else if (data.type === 'food_bookings') {
      addMessage({ role: 'bot', type: 'food_bookings', text: data.text, bookings: data.bookings, actions: foodActionsRef.current });
    } else if (data.type === 'food_stops') {
      addMessage({ role: 'bot', type: 'food_stops', text: data.text, booking: data.booking, stops: data.stops, actions: foodActionsRef.current });
    } else if (data.type === 'food_menu') {
      addMessage({ role: 'bot', type: 'food_menu', text: data.text, menu: data.menu, booking: data.booking, stop: data.stop, selectedKeys: data.selectedKeys, actions: foodActionsRef.current });
    } else if (data.type === 'food_summary') {
      const summary = { pnr: data.pnr, trainName: data.trainName, station: data.station, arrivalTime: data.arrivalTime, items: data.items, total: data.total };
      addMessage({ role: 'bot', type: 'food_summary', text: data.text, summary, actions: foodActionsRef.current });
    } else if (data.type === 'food_confirmed') {
      const order = { orderId: data.orderId, pnr: data.pnr, trainName: data.trainName, station: data.station, arrivalTime: data.arrivalTime, items: data.items, total: data.total };
      addMessage({ role: 'bot', type: 'food_confirmed', text: data.text, order });
    } else {
      addMessage({ role: 'bot', type: 'text', text: data.text });
    }
  }, [addMessage, verifyPayment, postChat]);

  const sendMessage = useCallback(async (text, onSelectTrain) => {
    if (!text.trim() || isLoading) return;
    selectTrainRef.current = onSelectTrain || selectTrainRef.current;

    // Add user message
    addMessage({ role: 'user', text: text.trim() });
    setIsLoading(true);

    try {
      const data = await postChat(text.trim());
      await presentData(data);
    } catch (err) {
      addMessage({
        role: 'bot',
        type: 'text',
        text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, addMessage, postChat, presentData]);

  const handleSelectTrain = useCallback(async (trainName, index, travelClass = null) => {
    // User clicked "Select" on a train card — send as a message
    const classText = travelClass ? ` in ${travelClass} class` : '';
    await sendMessage(`I'll take option ${index + 1}${classText}`);
  }, [sendMessage]);

  // Food widgets talk to the server through the normal chat channel so every
  // step stays visible (and server-owned) in the conversation.
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  return { messages, isLoading, sendMessage, handleSelectTrain, sessionId: SESSION_ID, customerId: CUSTOMER_ID };
}
