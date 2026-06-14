import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Editor from '@monaco-editor/react';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000/api';

const AnalyticsDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<any>(null);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replayCode, setReplayCode] = useState('');
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const editorRef = useRef<any>(null);
  const replayingRef = useRef(false);
  const replayTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      axios.get(`${API_BASE}/session/${id}`),
      axios.get(`${API_BASE}/session/${id}/chat`),
    ]).then(([sessRes, chatRes]) => {
      setSession(sessRes.data?.session);
      setChatLogs(chatRes.data?.messages || []);
      setReplayCode(sessRes.data?.session?.initialCode || '');
    }).catch(err => console.error(err)).finally(() => setLoading(false));
  }, [id]);

  const startReplay = () => {
    if (!session?.events?.length) return;
    const events = session.events.filter((e: any) => e.type === 'EDIT').sort((a: any, b: any) => a.timestamp - b.timestamp);
    if (!events.length) return;

    setReplayCode(session.initialCode || '');
    setIsReplaying(true);
    replayingRef.current = true;
    setReplayProgress(0);

    const model = editorRef.current?.getModel?.();
    if (model) model.setValue(session.initialCode || '');

    let idx = 0;
    const step = () => {
      if (idx >= events.length || !replayingRef.current) {
        setIsReplaying(false);
        replayingRef.current = false;
        setReplayProgress(100);
        return;
      }
      const evt = events[idx];
      const currentModel = editorRef.current?.getModel?.();
      if (currentModel && evt.payload?.changes) {
        for (const c of evt.payload.changes) {
          if (c.range) {
            currentModel.pushEditOperations([], [{ range: c.range, text: c.text || '', forceMoveMarkers: false }], () => null);
          }
        }
        setReplayCode(currentModel.getValue());
      }
      idx++;
      setReplayProgress((idx / events.length) * 100);
      replayTimeoutRef.current = window.setTimeout(step, 60);
    };
    setTimeout(step, 500);
  };

  const stopReplay = () => {
    replayingRef.current = false;
    setIsReplaying(false);
    if (replayTimeoutRef.current) clearTimeout(replayTimeoutRef.current);
  };

  if (loading) return <div className="analytics-page"><p>Loading...</p></div>;
  if (!session) return <div className="analytics-page"><p>Session not found</p></div>;

  const summary = session.interviewSummary;
  const duration = session.endTime ? Math.round((session.endTime - session.startTime) / 1000 / 60) : null;

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <h2>{session.candidate?.name || 'Anonymous'} - {session.language}</h2>
        <div className="header-right">
          <button onClick={() => navigate('/analytics')} className="btn">Back to List</button>
        </div>
      </header>

      <div className="analytics-detail">
        {/* Summary Card */}
        <div className="detail-card">
          <h3>Interview Summary</h3>
          {summary ? (
            <>
              <div className="summary-rating"><span className={`rating-badge ${(summary.rating || '').toLowerCase().replace(/\s+/g, '-')}`}>{summary.rating}</span></div>
              <p className="summary-text">{summary.summary}</p>
              {summary.strengths?.length > 0 && (
                <div><h4>Strengths</h4><ul>{summary.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>
              )}
              {summary.weaknesses?.length > 0 && (
                <div><h4>Areas for Improvement</h4><ul>{summary.weaknesses.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></div>
              )}
            </>
          ) : <p>No summary available</p>}
          <div className="summary-meta">
            <span>Duration: {duration ? `${duration} min` : 'In progress'}</span>
            <span>Status: {session.status}</span>
            <span>Difficulty: {session.difficulty}</span>
          </div>
        </div>

        {/* Test Results */}
        {session.finalResults && (
          <div className="detail-card">
            <h3>Test Results</h3>
            <div className="final-results">
              <div className="result-item">Public: {session.finalResults.publicPassed}/{session.finalResults.publicTotal}</div>
              <div className="result-item">Hidden: {session.finalResults.hiddenPassed}/{session.finalResults.hiddenTotal}</div>
              <div className="result-item">{session.finalResults.allPassed ? 'All Passed' : 'Some Failed'}</div>
            </div>
          </div>
        )}

        {/* Code Replay */}
        <div className="detail-card replay-card">
          <h3>Code Replay</h3>
          <div className="replay-controls">
            {!isReplaying ? (
              <button onClick={startReplay} className="btn btn-run" disabled={!session.events?.length}>Start Replay</button>
            ) : (
              <button onClick={stopReplay} className="btn">Stop</button>
            )}
            <span className="replay-progress-text">{Math.round(replayProgress)}%</span>
          </div>
          <div className="replay-editor">
            <Editor height="300px" language={session.language} value={replayCode}
              onMount={(editor) => { editorRef.current = editor; }}
              theme="vs-dark" options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13 }} />
          </div>
        </div>

        {/* Chat History */}
        {chatLogs.length > 0 && (
          <div className="detail-card">
            <h3>Interview Conversation ({chatLogs.length} messages)</h3>
            <div className="chat-history">
              {chatLogs.map((log: any, i: number) => (
                <div key={i} className={`chat-log-entry ${log.trigger}`}>
                  <div className="chat-log-meta">
                    <span className="chat-log-trigger">{log.trigger}</span>
                    <span className="chat-log-time">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {log.userMessage && <div className="chat-log-user">Candidate: {log.userMessage}</div>}
                  <div className="chat-log-response">Cortex: {log.extractedJson?.output_chat || '(no response)'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDetailPage;
