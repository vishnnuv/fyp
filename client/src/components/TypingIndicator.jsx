export default function TypingIndicator() {
  return (
    <div className="typing-row" role="status" aria-label="RailBot is typing">
      <div className="bot-avatar" aria-hidden="true">🚂</div>
      <div className="typing-bubble" aria-hidden="true">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </div>
      <span className="sr-only">RailBot is typing...</span>
    </div>
  );
}
