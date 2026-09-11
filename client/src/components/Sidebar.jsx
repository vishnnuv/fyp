export default function Sidebar({ onNewChat, onShowBookings }) {
  return (
    <aside className="sidebar" role="complementary" aria-label="Conversation history">
      {/* Logo / Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo" aria-hidden="true">🚂</div>
        <span className="sidebar-title">RailBot</span>
      </div>

      {/* New Chat Button */}
      <button
        className="sidebar-new-chat"
        onClick={onNewChat}
        aria-label="Start a new chat"
        id="new-chat-btn"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        New Chat
      </button>

      <button
        className="sidebar-bookings"
        onClick={onShowBookings}
        aria-label="Show my bookings"
        id="show-bookings-btn"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 3h12v18H6z" />
          <path d="M9 7h6M9 11h6M9 15h4" />
        </svg>
        My Bookings
      </button>

    </aside>
  );
}
