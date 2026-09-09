import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';

const WELCOME_CHIPS = [
  'Book Chennai to Bangalore',
  'Book 2 tickets to Mumbai',
  'Trains from Coimbatore tomorrow',
  'Multi-city booking',
];

export default function ChatWindow({ messages, isLoading, onSelectTrain, onChipClick }) {
  const bottomRef = useRef(null);
  const windowRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, isLoading]);

  const isEmpty = messages.length === 0;

  return (
    <div className="chat-window" ref={windowRef} role="log" aria-live="polite" aria-label="Chat messages">
      {isEmpty ? (
        <div className="welcome-screen">
          <div className="welcome-icon" aria-hidden="true">🚂</div>
          <h1 className="welcome-title">How can I help you today?</h1>
          <p className="welcome-subtitle">
            I'm RailBot — your AI assistant for booking Indian Railway tickets.
            Tell me where you'd like to go!
          </p>
          <div className="welcome-chips" role="list" aria-label="Suggested prompts">
            {WELCOME_CHIPS.map((chip) => (
              <button
                key={chip}
                className="welcome-chip"
                role="listitem"
                onClick={() => onChipClick && onChipClick(chip)}
                aria-label={`Try: ${chip}`}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="chat-messages-inner" role="list">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSelectTrain={onSelectTrain}
            />
          ))}
          {isLoading && <TypingIndicator />}
          <div ref={bottomRef} aria-hidden="true" style={{ height: '1px' }} />
        </div>
      )}
    </div>
  );
}
