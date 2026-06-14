import { useEffect, useState } from 'react';
import { getSocket } from '../socket';
import type { SessionRestored } from '../types';

const STORAGE_KEY = 'cortex_sessionId';

export function useSessionRecovery() {
  const [restoredSession, setRestoredSession] = useState<SessionRestored | null>(null);
  const [restoredSessionId, setRestoredSessionId] = useState<string | null>(null);

  useEffect(() => {
    const savedId = localStorage.getItem(STORAGE_KEY);
    if (!savedId) return;
    const socket = getSocket();
    socket.emit('reconnect-session', { sessionId: savedId });
    const handler = (data: SessionRestored) => { setRestoredSession(data); setRestoredSessionId(savedId); };
    socket.on('session-restored', handler);
    return () => { socket.off('session-restored', handler); };
  }, []);

  const saveSessionId = (id: string) => { localStorage.setItem(STORAGE_KEY, id); };
  const clearSessionId = () => { localStorage.removeItem(STORAGE_KEY); };

  return { restoredSession, restoredSessionId, saveSessionId, clearSessionId };
}
