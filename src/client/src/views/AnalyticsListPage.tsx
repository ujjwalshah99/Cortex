import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000/api';

interface SessionSummary {
  sessionId: string;
  language: string;
  candidate: { name: string; email: string };
  status: string;
  startTime: number;
  endTime?: number;
  difficulty: string;
  finalResults?: { publicPassed: number; publicTotal: number; hiddenPassed: number; hiddenTotal: number; allPassed: boolean };
  interviewSummary?: { rating: string; summary: string };
}

const AnalyticsListPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    axios.get(`${API_BASE}/sessions`).then(res => {
      setSessions(res.data?.sessions || []);
    }).catch(err => console.error('Failed to load sessions:', err)).finally(() => setLoading(false));
  }, []);

  const formatDuration = (start: number, end?: number) => {
    if (!end) return 'In progress';
    const sec = Math.floor((end - start) / 1000);
    return `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="analytics-page">
      <header className="analytics-header">
        <h2>Cortex - Interview Sessions</h2>
        <button onClick={() => navigate('/')} className="btn">Back to Home</button>
      </header>
      {loading ? <div className="analytics-loading">Loading sessions...</div> : (
        <div className="analytics-table-wrapper">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Email</th>
                <th>Language</th>
                <th>Duration</th>
                <th>Tests</th>
                <th>Rating</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr><td colSpan={7} className="no-data">No sessions yet</td></tr>
              ) : sessions.map(s => (
                <tr key={s.sessionId} onClick={() => navigate(`/analytics/${s.sessionId}`)} className="clickable-row">
                  <td>{s.candidate?.name || 'Anonymous'}</td>
                  <td>{s.candidate?.email || '-'}</td>
                  <td>{s.language}</td>
                  <td>{formatDuration(s.startTime, s.endTime)}</td>
                  <td>{s.finalResults ? `${s.finalResults.publicPassed + s.finalResults.hiddenPassed}/${s.finalResults.publicTotal + s.finalResults.hiddenTotal}` : '-'}</td>
                  <td><span className={`rating-badge ${(s.interviewSummary?.rating || '').toLowerCase().replace(/\s+/g, '-')}`}>{s.interviewSummary?.rating || '-'}</span></td>
                  <td><span className={`status-badge ${s.status}`}>{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AnalyticsListPage;
