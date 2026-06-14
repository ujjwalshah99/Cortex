import React from 'react';

interface TimerBarProps { elapsed: number; remaining: number; percent: number; }

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000); return `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;
}

const TimerBar: React.FC<TimerBarProps> = ({ elapsed, remaining, percent }) => {
  const cls = percent >= 80 ? 'urgent' : percent >= 60 ? 'caution' : 'normal';
  return (
    <div className={`timer-bar ${cls}`}>
      <span className="timer-text">{formatTime(elapsed)} / {formatTime(elapsed + remaining)}</span>
      <div className="timer-progress"><div className="timer-fill" style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <span className="timer-percent">{Math.round(percent)}%</span>
    </div>
  );
};
export default TimerBar;
