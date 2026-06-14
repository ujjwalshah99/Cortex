import { useRef, useCallback } from 'react';
import { getSocket } from '../socket';

export function useTelemetry(sessionId: string | null) {
  const pendingEdits = useRef<any[]>([]);
  const pendingLineUpdates = useRef<Record<number, { timestamp: number; content: string }>>({});
  const pendingLineMetrics = useRef<Record<number, { timestamp: number; metrics: any }>>({});
  const pendingPasteEvents = useRef<any[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(Date.now());

  const setSessionStart = useCallback((ts: number) => { sessionStartRef.current = ts; }, []);

  const flush = useCallback(() => {
    if (!sessionId) return;
    const edits = pendingEdits.current.splice(0);
    const pasteEvents = pendingPasteEvents.current.splice(0);
    const lineUpdates = Object.entries(pendingLineUpdates.current).map(([ln, d]) => ({
      lineNumber: parseInt(ln, 10), timestamp: d.timestamp, content: d.content,
    }));
    pendingLineUpdates.current = {};
    const lineMetrics = Object.entries(pendingLineMetrics.current).map(([ln, d]) => ({
      lineNumber: parseInt(ln, 10), timestamp: d.timestamp, metrics: d.metrics,
    }));
    pendingLineMetrics.current = {};
    if (edits.length === 0 && lineUpdates.length === 0 && lineMetrics.length === 0 && pasteEvents.length === 0) return;
    getSocket().emit('telemetry', { sessionId, edits, lineUpdates, lineMetrics, pasteEvents });
  }, [sessionId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = window.setTimeout(flush, 350);
  }, [flush]);

  const recordEdit = useCallback((changes: any[], isUndo: boolean, isRedo: boolean) => {
    const relTs = Date.now() - sessionStartRef.current;
    pendingEdits.current.push({
      timestamp: relTs, type: 'EDIT',
      payload: { changes: changes.map((c: any) => ({
        rangeOffset: c.rangeOffset, rangeLength: c.rangeLength, text: c.text,
        range: { startLineNumber: c.range?.startLineNumber, startColumn: c.range?.startColumn,
                 endLineNumber: c.range?.endLineNumber, endColumn: c.range?.endColumn },
      })) },
    });
    for (const change of changes) {
      const text = change.text || '';
      if (text.length > 50 && text.includes('\n')) {
        pendingPasteEvents.current.push({
          timestamp: relTs, type: 'PASTE',
          payload: { charCount: text.length, lineCount: text.split('\n').length, text: text.substring(0, 500) },
        });
      }
    }
    if (pendingEdits.current.length >= 25) flush();
    else scheduleFlush();
  }, [flush, scheduleFlush]);

  const recordLineUpdate = useCallback((lineNumber: number, content: string) => {
    const relTs = Date.now() - sessionStartRef.current;
    const prev = pendingLineUpdates.current[lineNumber];
    if (prev && prev.content === content) return;
    pendingLineUpdates.current[lineNumber] = { timestamp: relTs, content };
    scheduleFlush();
  }, [scheduleFlush]);

  const recordLineMetrics = useCallback((lineNumber: number, metrics: any) => {
    const relTs = Date.now() - sessionStartRef.current;
    pendingLineMetrics.current[lineNumber] = { timestamp: relTs, metrics };
    scheduleFlush();
  }, [scheduleFlush]);

  const forceFlush = useCallback(() => {
    if (flushTimerRef.current !== null) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    flush();
  }, [flush]);

  return { recordEdit, recordLineUpdate, recordLineMetrics, forceFlush, setSessionStart };
}
