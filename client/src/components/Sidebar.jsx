export default function Sidebar({ onNewChat }) {
  const pastChats = [
    { id: 1, title: 'Chennai → Bangalore booking', active: true },
    { id: 2, title: 'Mumbai trip planning' },
    { id: 3, title: 'Coimbatore Express query' },
  ];

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

      {/* Recent Conversations */}
      <p className="sidebar-section-label">Recent</p>
      {pastChats.map((chat) => (
        <div
          key={chat.id}
          className={`sidebar-chat-item ${chat.active ? 'active' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={`Open conversation: ${chat.title}`}
        >
          <svg className="sidebar-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          {chat.title}
        </div>
      ))}
    </aside>
  );
}
