import React, { useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import EntryPage from './views/EntryPage';
import InterviewPage from './views/InterviewPage';
import { getSocket } from './socket';
import { useSessionRecovery } from './hooks/useSessionRecovery';
import type { QuestionItem, SessionCreated } from './types';

function App() {
  const navigate = useNavigate();
  const { saveSessionId } = useSessionRecovery();
  const [data, setData] = useState<{
    sessionId: string; question: QuestionItem; initialCode: string;
    language: string; timeLimit: number; startTime: number; candidateName: string;
  } | null>(null);

  const handleStart = useCallback((name: string, email: string, language: string) => {
    const socket = getSocket();
    socket.emit('start-session', { candidateName: name, candidateEmail: email, language, questionId: null });
    socket.once('session-created', (d: SessionCreated) => {
      saveSessionId(d.sessionId);
      setData({ sessionId: d.sessionId, question: d.question, initialCode: d.initialCode, language, timeLimit: d.timeLimit, startTime: d.startTime, candidateName: name });
      navigate('/interview');
    });
  }, [navigate, saveSessionId]);

  return (
    <Routes>
      <Route path="/" element={<EntryPage onStart={handleStart} />} />
      <Route path="/interview" element={data ? <InterviewPage {...data} /> : <EntryPage onStart={handleStart} />} />
    </Routes>
  );
}
export default App;
