import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';

interface Props { messages: ChatMessage[]; onSendMessage: (text: string) => void; isLoading: boolean; }

const InterviewerPanel: React.FC<Props> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = () => { const t = input.trim(); if (!t || isLoading) return; onSendMessage(t); setInput(''); };
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };

  return (
    <div className="interviewer-panel">
      <div className="chat-messages">
        {messages.map(m => (
          <div key={m.id} className={`chat-message ${m.sender}`}>
            <div className="message-sender">{m.sender === 'interviewer' ? 'Cortex' : 'You'}</div>
            <div className="message-text">{m.text}</div>
            <div className="message-time">{m.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
        ))}
        {isLoading && <div className="chat-message interviewer"><div className="message-sender">Cortex</div><div className="message-text"><div className="typing-indicator"><span /><span /><span /></div></div></div>}
        <div ref={endRef} />
      </div>
      <div className="chat-input-area">
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey} placeholder="Ask Cortex anything..." disabled={isLoading} rows={2} />
        <button onClick={send} disabled={isLoading || !input.trim()}>Send</button>
      </div>
    </div>
  );
};
export default InterviewerPanel;
