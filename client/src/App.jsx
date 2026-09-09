import { useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import InputBar from './components/InputBar';
import { useChat } from './hooks/useChat';
import './index.css';

export default function App() {
  const { messages, isLoading, sendMessage, handleSelectTrain } = useChat();

  const handleSend = useCallback(async (text) => {
    await sendMessage(text, handleSelectTrain);
  }, [sendMessage, handleSelectTrain]);

  const handleChipClick = useCallback((chip) => {
    handleSend(chip);
  }, [handleSend]);

  const handleNewChat = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="app-layout">
      {/* Left Sidebar */}
      <Sidebar onNewChat={handleNewChat} />

      {/* Main Chat Area */}
      <main className="chat-main">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-left">
            <div className="chat-header-avatar" aria-hidden="true">🚂</div>
            <div>
              <div className="chat-header-title">RailBot</div>
              <div className="chat-header-subtitle">Online · Ready to book</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', textAlign: 'right' }}>
            <div style={{ fontWeight: 500 }}>Chatbot-Assisted Ticketing</div>
          </div>
        </header>

        {/* Messages */}
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onSelectTrain={handleSelectTrain}
          onChipClick={handleChipClick}
        />

        {/* Input */}
        <InputBar onSend={handleSend} isLoading={isLoading} />
      </main>
    </div>
  );
}
