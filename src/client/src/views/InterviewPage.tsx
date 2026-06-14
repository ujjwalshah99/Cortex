import React, { useState, useRef, useCallback, useEffect } from 'react';
import CodeEditor from '../components/CodeEditor';
import OutputPanel from '../components/OutputPanel';
import QuestionPanel from '../components/QuestionPanel';
import InterviewerPanel from '../components/InterviewerPanel';
import TimerBar from '../components/TimerBar';
import { useTelemetry } from '../hooks/useTelemetry';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useTabVisibility } from '../hooks/useTabVisibility';
import { getSocket } from '../socket';
import { runCode as apiRunCode, submitCode as apiSubmitCode } from '../api';
import type { QuestionItem, TestResult, ChatMessage, TimerSync } from '../types';

interface Props {
  sessionId: string; question: QuestionItem; initialCode: string;
  language: string; timeLimit: number; startTime: number; candidateName: string;
}

const LANGS = [{ value: 'python', label: 'Python' }, { value: 'javascript', label: 'JavaScript' }, { value: 'java', label: 'Java' }, { value: 'c', label: 'C' }, { value: 'cpp', label: 'C++' }];

const InterviewPage: React.FC<Props> = ({ sessionId, question, initialCode, language: initLang, timeLimit, startTime, candidateName }) => {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initLang);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [timer, setTimer] = useState<TimerSync>({ elapsed: 0, remaining: timeLimit, percent: 0 });
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: '1', text: `Hi ${candidateName}, I'm Cortex. I'll be your interviewer today. We have ${Math.round(timeLimit/60000)} minutes together. Take a moment to read the problem on the left, and start coding whenever you're ready. Feel free to talk to me anytime!`,
    sender: 'interviewer', timestamp: new Date(),
  }]);
  const [chatLoading, setChatLoading] = useState(false);
  const editorRef = useRef<any>(null);
  const telemetry = useTelemetry(sessionId);
  const [leftPct, setLeftPct] = useState(25);
  const [rightPct, setRightPct] = useState(25);
  const [midSplit, setMidSplit] = useState(60);
  const dragLeftRef = useRef(false);
  const dragRightRef = useRef(false);
  const dragMidRef = useRef(false);
  const dragStartX = useRef(0);
  const dragStartY = useRef(0);
  const dragStartPct = useRef(0);

  useTabVisibility(sessionId, startTime);
  useEffect(() => { telemetry.setSessionStart(startTime); }, [startTime, telemetry]);

  useEffect(() => {
    const socket = getSocket();
    const onTimer = (d: TimerSync) => setTimer(d);
    const onTimeout = () => setMessages(p => [...p, { id: Date.now().toString(), text: "Time's up! Thanks for your effort today.", sender: 'interviewer', timestamp: new Date() }]);
    const onMsg = (d: { text: string; trigger: string }) => { setMessages(p => [...p, { id: Date.now().toString(), text: d.text, sender: 'interviewer', timestamp: new Date(), trigger: d.trigger }]); setChatLoading(false); };
    socket.on('timer-sync', onTimer);
    socket.on('session-timeout', onTimeout);
    socket.on('interviewer-message', onMsg);
    return () => { socket.off('timer-sync', onTimer); socket.off('session-timeout', onTimeout); socket.off('interviewer-message', onMsg); };
  }, []);

  const handleMount = useCallback((editor: any) => {
    editorRef.current = editor;
    const model = editor.getModel();
    if (!model) return;
    model.onDidChangeContent((e: any) => {
      telemetry.recordEdit(e.changes || [], e.isUndoing, e.isRedoing);
      for (const c of e.changes || []) {
        for (let i = c.range.startLineNumber; i <= Math.min(c.range.endLineNumber, model.getLineCount()); i++) {
          try { telemetry.recordLineUpdate(i, model.getLineContent(i)); } catch {}
        }
      }
    });
    editor.onDidBlurEditorText(() => telemetry.forceFlush());
  }, [telemetry]);

  const handleRun = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    setIsRunning(true); setOutput(''); setError(''); setTestResults([]);
    try {
      const r = await apiRunCode(language, code, question.id);
      setOutput(r.output || ''); setError(r.error || ''); setTestResults(r.testResults || []);
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to execute code.'); }
    finally { setIsRunning(false); }
  }, [code, language, question.id, isRunning]);

  const handleSubmit = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    setIsRunning(true); setOutput(''); setError(''); setTestResults([]);
    try {
      const r = await apiSubmitCode(language, code, question.id);
      setError(r.error || ''); setTestResults(r.testResults || []);
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to submit.'); }
    finally { setIsRunning(false); }
  }, [code, language, question.id, isRunning]);

  useKeyboardShortcuts(handleRun, handleSubmit, editorRef);

  const sendMsg = useCallback((text: string) => {
    setMessages(p => [...p, { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() }]);
    setChatLoading(true);
    getSocket().emit('chat-message', { sessionId, text });
    setTimeout(() => setChatLoading(false), 15000);
  }, [sessionId]);

  useEffect(() => { const last = messages[messages.length - 1]; if (last?.sender === 'interviewer') setChatLoading(false); }, [messages]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const ct = document.getElementById('interview-container');
      if (!ct) return;
      const r = ct.getBoundingClientRect();
      if (dragLeftRef.current) setLeftPct(Math.max(15, Math.min(40, dragStartPct.current + ((e.clientX - dragStartX.current) / r.width) * 100)));
      if (dragRightRef.current) setRightPct(Math.max(15, Math.min(40, dragStartPct.current + ((dragStartX.current - e.clientX) / r.width) * 100)));
      if (dragMidRef.current) { const m = document.getElementById('mid-pane'); if (m) setMidSplit(Math.max(30, Math.min(80, dragStartPct.current + ((e.clientY - dragStartY.current) / m.getBoundingClientRect().height) * 100))); }
    };
    const onUp = () => { dragLeftRef.current = false; dragRightRef.current = false; dragMidRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div className="interview-page">
      <header className="interview-header">
        <div className="header-left">
          <h2>Cortex</h2>
          <select value={language} onChange={e => setLanguage(e.target.value)} className="lang-select">
            {LANGS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="header-right">
          <button className="btn btn-run" onClick={handleRun} disabled={isRunning}>{isRunning ? 'Running...' : 'Run (Ctrl+Enter)'}</button>
          <button className="btn btn-submit" onClick={handleSubmit} disabled={isRunning}>Submit (Ctrl+Shift+Enter)</button>
        </div>
      </header>
      <TimerBar elapsed={timer.elapsed} remaining={timer.remaining} percent={timer.percent} />
      <div id="interview-container" className="interview-container">
        <div className="pane pane-left" style={{ width: `${leftPct}%` }}>
          <div className="pane-header">Problem</div>
          <div className="pane-content"><QuestionPanel question={question} /></div>
        </div>
        <div className="gutter gutter-vertical" onMouseDown={e => { dragStartX.current = e.clientX; dragStartPct.current = leftPct; dragLeftRef.current = true; }} />
        <div id="mid-pane" className="pane pane-middle" style={{ width: `${100 - leftPct - rightPct}%` }}>
          <div className="middle-top" style={{ height: `${midSplit}%` }}><CodeEditor code={code} language={language} onCodeChange={setCode} onEditorMount={handleMount} /></div>
          <div className="gutter gutter-horizontal" onMouseDown={e => { dragStartY.current = e.clientY; dragStartPct.current = midSplit; dragMidRef.current = true; }} />
          <div className="middle-bottom" style={{ height: `${100 - midSplit}%` }}><OutputPanel output={output} error={error} testResults={testResults} isRunning={isRunning} /></div>
        </div>
        <div className="gutter gutter-vertical" onMouseDown={e => { dragStartX.current = e.clientX; dragStartPct.current = rightPct; dragRightRef.current = true; }} />
        <div className="pane pane-right" style={{ width: `${rightPct}%` }}>
          <div className="pane-header">Interviewer</div>
          <div className="pane-content"><InterviewerPanel messages={messages} onSendMessage={sendMsg} isLoading={chatLoading} /></div>
        </div>
      </div>
    </div>
  );
};
export default InterviewPage;
