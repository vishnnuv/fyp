import { useState, useCallback } from 'react';

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

export function useChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, { id: Date.now() + Math.random(), timestamp: new Date(), ...msg }]);
  }, []);

  const sendMessage = useCallback(async (text, onSelectTrain) => {
    if (!text.trim() || isLoading) return;

    // Add user message
    addMessage({ role: 'user', text: text.trim() });
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), sessionId: SESSION_ID, customerId: CUSTOMER_ID }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server error');
      }

      const result = await response.json();
      const data = result.data;

      if (data.type === 'train_options') {
        addMessage({
          role: 'bot',
          type: 'train_options',
          text: data.text,
          trains: data.trains,
          booking: data.booking,
          numTickets: data.numTickets,
          onSelectTrain,
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
        });
        // If there's a follow-up booking, show that prompt too
        if (data.nextBookingPrompt) {
          setTimeout(() => {
            addMessage({ role: 'bot', type: 'text', text: data.nextBookingPrompt });
          }, 800);
        }
      } else {
        addMessage({ role: 'bot', type: 'text', text: data.text });
      }
    } catch (err) {
      addMessage({
        role: 'bot',
        type: 'text',
        text: `⚠️ Sorry, something went wrong: ${err.message}. Please try again.`,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, addMessage]);

  const handleSelectTrain = useCallback(async (trainName, index) => {
    // User clicked "Select" on a train card — send as a message
    const selectionText = `I'll take option ${index + 1} — the ${trainName}`;
    await sendMessage(selectionText);
  }, [sendMessage]);

  const handleTrainAndClassSelection = useCallback(async (trainName, index, travelClass = null) => {
    const classText = travelClass ? ` in ${travelClass} class` : '';
    await sendMessage(`I'll take option ${index + 1}${classText}`, undefined);
  }, [sendMessage]);

  return { messages, isLoading, sendMessage, handleSelectTrain: handleTrainAndClassSelection, sessionId: SESSION_ID, customerId: CUSTOMER_ID };
}
