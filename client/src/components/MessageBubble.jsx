import TrainCard from './TrainCard';
import ConfirmCard from './ConfirmCard';
import BookingList from './BookingList';

// Simple markdown-like text renderer
function BotText({ text }) {
  if (!text) return null;
  // Split by **bold** markers and newlines
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <div className="bot-text-content">
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />;
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

function formatTime(date) {
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function MessageBubble({ message, onSelectTrain }) {
  const isUser = message.role === 'user';
  const isBot = message.role === 'bot';

  if (isUser) {
    return (
      <div className="message-row user" role="listitem">
        <div className="message-content-wrapper">
          <div className="message-bubble">
            {message.text}
          </div>
          <span className="message-time" aria-label={`Sent at ${formatTime(message.timestamp)}`}>
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  if (isBot) {
    return (
      <div className="message-row bot" role="listitem">
        <div className="bot-avatar" aria-hidden="true">🚂</div>
        <div className="message-content-wrapper" style={{ maxWidth: 'calc(100% - 44px)' }}>
          <div className="message-bubble">
            {/* Main text */}
            {message.text && <BotText text={message.text} />}

            {/* Train options */}
            {message.type === 'train_options' && message.trains && (
              <div className="train-options-container" role="list" aria-label="Available train options">
                {message.trains.map((train, i) => (
                  <TrainCard
                    key={train.train_number}
                    train={train}
                    index={i}
                    booking={message.booking}
                    numTickets={message.numTickets}
                    onSelect={onSelectTrain}
                  />
                ))}
              </div>
            )}

            {/* Booking confirmation */}
            {message.type === 'booking_confirmed' && (
              <ConfirmCard
                pnr={message.pnr}
                train={message.train}
                booking={message.booking}
                selectedClass={message.selectedClass}
                numTickets={message.numTickets}
                totalFare={message.totalFare}
                travelDate={message.travelDate}
                paymentId={message.paymentId}
                paymentMethod={message.paymentMethod}
              />
            )}

            {message.type === 'booking_list' && message.bookings && (
              <BookingList bookings={message.bookings} />
            )}
          </div>
          <span className="message-time">
            {formatTime(message.timestamp)}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
