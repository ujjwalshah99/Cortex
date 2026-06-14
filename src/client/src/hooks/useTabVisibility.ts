import { useEffect } from 'react';
import { getSocket } from '../socket';

export function useTabVisibility(sessionId: string | null, sessionStart: number) {
  useEffect(() => {
    if (!sessionId) return;
    const handler = () => {
      const timestamp = Date.now() - sessionStart;
      getSocket().emit('telemetry-meta', {
        sessionId, type: document.hidden ? 'TAB_AWAY' : 'TAB_RETURN', timestamp,
      });
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [sessionId, sessionStart]);
}
