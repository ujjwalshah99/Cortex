# Plan 3: Frontend Interview UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React frontend with entry page, 3-pane interview layout (question panel, Monaco editor + output, interviewer chat panel), timer bar, keyboard shortcuts, tab visibility tracking, and Socket.io client integration.

**Architecture:** React 18 + TypeScript CRA app inside `src/client/`. Communicates with the server via Socket.io for real-time events and REST API for code execution. Monaco editor captures keystrokes and computes telemetry client-side before streaming to server. Three resizable panes with drag handles.

**Tech Stack:** React 18, TypeScript, Monaco Editor (@monaco-editor/react), Socket.io client, axios, react-router-dom

---

## File Map

| File | Responsibility |
|---|---|
| `src/client/package.json` | React app dependencies |
| `src/client/tsconfig.json` | TypeScript config |
| `src/client/public/index.html` | HTML entry point |
| `src/client/src/index.tsx` | React entry point |
| `src/client/src/App.tsx` | Root component with routing |
| `src/client/src/socket.ts` | Socket.io client singleton |
| `src/client/src/api.ts` | REST API client (axios) |
| `src/client/src/views/EntryPage.tsx` | Candidate name/email entry screen |
| `src/client/src/views/InterviewPage.tsx` | Main 3-pane interview layout |
| `src/client/src/components/QuestionPanel.tsx` | Left pane: problem display |
| `src/client/src/components/CodeEditor.tsx` | Middle top: Monaco editor |
| `src/client/src/components/OutputPanel.tsx` | Middle bottom: output + test results |
| `src/client/src/components/InterviewerPanel.tsx` | Right pane: text chat with Cortex |
| `src/client/src/components/TimerBar.tsx` | Timer + progress bar |
| `src/client/src/hooks/useTelemetry.ts` | Keystroke capture, line metrics, paste detection, batching |
| `src/client/src/hooks/useKeyboardShortcuts.ts` | Ctrl+Enter, Ctrl+Shift+Enter |
| `src/client/src/hooks/useTabVisibility.ts` | Tab focus/blur tracking |
| `src/client/src/hooks/useSessionRecovery.ts` | localStorage sessionId persistence |
| `src/client/src/styles/App.css` | All styles |

---

### Task 1: Initialize React App

**Files:**
- Create: `src/client/package.json`
- Create: `src/client/tsconfig.json`
- Create: `src/client/public/index.html`
- Create: `src/client/src/index.tsx`
- Create: `src/client/src/react-app-env.d.ts`

- [ ] **Step 1: Create package.json for React app**

```json
{
  "name": "cortex-client",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@monaco-editor/react": "^4.6.0",
    "axios": "^1.7.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.26.0",
    "react-scripts": "5.0.1",
    "socket.io-client": "^4.8.0",
    "typescript": "^4.9.5",
    "web-vitals": "^2.1.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  },
  "scripts": {
    "start": "PORT=3001 react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test"
  },
  "proxy": "http://localhost:3000",
  "browserslist": {
    "production": [">0.2%", "not dead", "not op_mini all"],
    "development": ["last 1 chrome version", "last 1 firefox version", "last 1 safari version"]
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#1a1a2e" />
  <title>Cortex - Coding Interview</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

- [ ] **Step 4: Create src/index.tsx**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles/App.css';

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
```

- [ ] **Step 5: Create src/react-app-env.d.ts**

```typescript
/// <reference types="react-scripts" />
```

- [ ] **Step 6: Install dependencies**

Run: `cd /Users/shipsy/Desktop/gen-ai-project/src/client && npm install`

- [ ] **Step 7: Commit**

```bash
git add src/client/package.json src/client/package-lock.json src/client/tsconfig.json src/client/public/ src/client/src/index.tsx src/client/src/react-app-env.d.ts
git commit -m "feat: initialize react client app"
```

---

### Task 2: Socket.io Client + API Client + Types

**Files:**
- Create: `src/client/src/socket.ts`
- Create: `src/client/src/api.ts`
- Create: `src/client/src/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export interface QuestionItem {
  id: string;
  title: string;
  Full_question: string;
  short_description: string;
  difficulty: { numeric: number; label: string };
  concepts: string[];
  canonical_skeleton: Record<string, string>;
  public_tests: Array<{ input: any; output: any; explanation?: string | null }>;
  constraints?: { time_ms?: number; memory_mb?: number };
  edge_cases?: string[];
  hint_templates?: Array<{ nudge?: string; guide?: string; direction?: string }>;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  input: any;
  expected: any;
  actual: any;
  executionTime: number;
}

export interface RunResult {
  output: string;
  error: string;
  testResults?: TestResult[];
}

export interface SubmitResult {
  error: string | null;
  testResults: TestResult[];
  finalResults: {
    publicPassed: number;
    publicTotal: number;
    hiddenPassed: number;
    hiddenTotal: number;
    allPassed: boolean;
  };
}

export interface TimerSync {
  elapsed: number;
  remaining: number;
  percent: number;
}

export interface SessionCreated {
  sessionId: string;
  question: QuestionItem;
  initialCode: string;
  timeLimit: number;
  startTime: number;
}

export interface SessionRestored {
  code: string;
  language: string;
  startTime: number;
  timeLimit: number;
  helpLevel: number;
  struggleScore: number;
  candidate: { name: string; email: string };
  questionId: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'interviewer';
  timestamp: Date;
  trigger?: string;
}
```

- [ ] **Step 2: Create socket.ts**

```typescript
import { io, Socket } from 'socket.io-client';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
```

- [ ] **Step 3: Create api.ts**

```typescript
import axios from 'axios';
import type { RunResult, SubmitResult, QuestionItem } from './types';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3000/api';

export async function runCode(language: string, code: string, questionId?: string): Promise<RunResult> {
  const resp = await axios.post(`${API_BASE}/run`, { language, code, questionId });
  return resp.data;
}

export async function checkSyntax(language: string, code: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const resp = await axios.post(`${API_BASE}/check`, { language, code });
  return resp.data;
}

export async function submitCode(language: string, code: string, questionId: string): Promise<SubmitResult> {
  const resp = await axios.post(`${API_BASE}/submit`, { language, code, questionId });
  return resp.data;
}

export async function fetchQuestions(): Promise<{ ok: boolean; total: number; questions: QuestionItem[] }> {
  const resp = await axios.get(`${API_BASE}/questions`);
  return resp.data;
}

export async function fetchQuestionById(id: string): Promise<{ ok: boolean; question: QuestionItem }> {
  const resp = await axios.get(`${API_BASE}/questions/${id}`);
  return resp.data;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/client/src/types.ts src/client/src/socket.ts src/client/src/api.ts
git commit -m "feat: add socket.io client, API client, and type definitions"
```

---

### Task 3: Hooks (Telemetry, Keyboard, Tab, Session Recovery)

**Files:**
- Create: `src/client/src/hooks/useTelemetry.ts`
- Create: `src/client/src/hooks/useKeyboardShortcuts.ts`
- Create: `src/client/src/hooks/useTabVisibility.ts`
- Create: `src/client/src/hooks/useSessionRecovery.ts`

- [ ] **Step 1: Create useTelemetry.ts**

```typescript
import { useRef, useCallback } from 'react';
import { getSocket } from '../socket';

interface TelemetryBatch {
  sessionId: string;
  edits: any[];
  lineUpdates: any[];
  lineMetrics: any[];
  pasteEvents: any[];
}

export function useTelemetry(sessionId: string | null) {
  const pendingEdits = useRef<any[]>([]);
  const pendingLineUpdates = useRef<Record<number, { timestamp: number; content: string }>>({});
  const pendingLineMetrics = useRef<Record<number, { timestamp: number; metrics: any }>>({});
  const pendingPasteEvents = useRef<any[]>([]);
  const lastFlushRef = useRef<number>(0);
  const flushTimerRef = useRef<number | null>(null);
  const sessionStartRef = useRef<number>(Date.now());

  const setSessionStart = useCallback((ts: number) => {
    sessionStartRef.current = ts;
  }, []);

  const flush = useCallback(() => {
    if (!sessionId) return;

    const edits = pendingEdits.current.splice(0);
    const pasteEvents = pendingPasteEvents.current.splice(0);

    const lineUpdates = Object.entries(pendingLineUpdates.current).map(([ln, data]) => ({
      lineNumber: parseInt(ln, 10),
      timestamp: data.timestamp,
      content: data.content,
    }));
    pendingLineUpdates.current = {};

    const lineMetrics = Object.entries(pendingLineMetrics.current).map(([ln, data]) => ({
      lineNumber: parseInt(ln, 10),
      timestamp: data.timestamp,
      metrics: data.metrics,
    }));
    pendingLineMetrics.current = {};

    if (edits.length === 0 && lineUpdates.length === 0 && lineMetrics.length === 0 && pasteEvents.length === 0) return;

    const socket = getSocket();
    socket.emit('telemetry', { sessionId, edits, lineUpdates, lineMetrics, pasteEvents } as TelemetryBatch);
    lastFlushRef.current = Date.now();
  }, [sessionId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = window.setTimeout(() => {
      flush();
    }, 350);
  }, [flush]);

  const recordEdit = useCallback((changes: any[], isUndo: boolean, isRedo: boolean) => {
    const now = Date.now();
    const relTs = now - sessionStartRef.current;

    pendingEdits.current.push({
      timestamp: relTs,
      type: 'EDIT',
      payload: {
        changes: changes.map((c: any) => ({
          rangeOffset: c.rangeOffset,
          rangeLength: c.rangeLength,
          text: c.text,
          range: {
            startLineNumber: c.range?.startLineNumber,
            startColumn: c.range?.startColumn,
            endLineNumber: c.range?.endLineNumber,
            endColumn: c.range?.endColumn,
          },
        })),
      },
    });

    // Detect paste events
    for (const change of changes) {
      const text = change.text || '';
      if (text.length > 50 && text.includes('\n')) {
        pendingPasteEvents.current.push({
          timestamp: relTs,
          type: 'PASTE',
          payload: {
            charCount: text.length,
            lineCount: text.split('\n').length,
            text: text.substring(0, 500),
          },
        });
      }
    }

    // Flush if buffer is large
    if (pendingEdits.current.length >= 25) {
      flush();
    } else {
      scheduleFlush();
    }
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
    if (flushTimerRef.current !== null) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flush();
  }, [flush]);

  return {
    recordEdit,
    recordLineUpdate,
    recordLineMetrics,
    forceFlush,
    setSessionStart,
  };
}
```

- [ ] **Step 2: Create useKeyboardShortcuts.ts**

```typescript
import { useEffect } from 'react';

export function useKeyboardShortcuts(
  onRun: () => void,
  onSubmit: () => void,
  editorRef: React.RefObject<any>
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        onSubmit();
      } else if (mod && e.key === 'Enter') {
        e.preventDefault();
        onRun();
      } else if (e.key === 'Escape') {
        editorRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onRun, onSubmit, editorRef]);
}
```

- [ ] **Step 3: Create useTabVisibility.ts**

```typescript
import { useEffect } from 'react';
import { getSocket } from '../socket';

export function useTabVisibility(sessionId: string | null, sessionStart: number) {
  useEffect(() => {
    if (!sessionId) return;

    const handler = () => {
      const timestamp = Date.now() - sessionStart;
      const socket = getSocket();
      socket.emit('telemetry-meta', {
        sessionId,
        type: document.hidden ? 'TAB_AWAY' : 'TAB_RETURN',
        timestamp,
      });
    };

    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [sessionId, sessionStart]);
}
```

- [ ] **Step 4: Create useSessionRecovery.ts**

```typescript
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

    const handler = (data: SessionRestored) => {
      setRestoredSession(data);
      setRestoredSessionId(savedId);
    };

    socket.on('session-restored', handler);
    return () => { socket.off('session-restored', handler); };
  }, []);

  const saveSessionId = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
  };

  const clearSessionId = () => {
    localStorage.removeItem(STORAGE_KEY);
  };

  return { restoredSession, restoredSessionId, saveSessionId, clearSessionId };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/client/src/hooks/
git commit -m "feat: add telemetry, keyboard, tab visibility, and session recovery hooks"
```

---

### Task 4: Components - TimerBar + QuestionPanel

**Files:**
- Create: `src/client/src/components/TimerBar.tsx`
- Create: `src/client/src/components/QuestionPanel.tsx`

- [ ] **Step 1: Create TimerBar.tsx**

```tsx
import React from 'react';

interface TimerBarProps {
  elapsed: number;
  remaining: number;
  percent: number;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

const TimerBar: React.FC<TimerBarProps> = ({ elapsed, remaining, percent }) => {
  const urgencyClass = percent >= 80 ? 'urgent' : percent >= 60 ? 'caution' : 'normal';

  return (
    <div className={`timer-bar ${urgencyClass}`}>
      <span className="timer-text">
        {formatTime(elapsed)} / {formatTime(elapsed + remaining)}
      </span>
      <div className="timer-progress">
        <div className="timer-fill" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <span className="timer-percent">{Math.round(percent)}%</span>
    </div>
  );
};

export default TimerBar;
```

- [ ] **Step 2: Create QuestionPanel.tsx**

```tsx
import React from 'react';
import type { QuestionItem } from '../types';

interface QuestionPanelProps {
  question: QuestionItem | null;
}

const QuestionPanel: React.FC<QuestionPanelProps> = ({ question }) => {
  if (!question) {
    return <div className="question-panel"><p>Loading question...</p></div>;
  }

  return (
    <div className="question-panel">
      <h3>{question.title}</h3>

      <div className="question-meta">
        <span className={`difficulty-badge ${question.difficulty?.label || 'unknown'}`}>
          {question.difficulty?.label}
        </span>
        {question.concepts?.map((c) => (
          <span key={c} className="concept-badge">{c}</span>
        ))}
      </div>

      {question.short_description && <p className="question-desc">{question.short_description}</p>}

      {question.Full_question && (
        <div className="question-section">
          <h4>Problem</h4>
          <div className="question-text">{question.Full_question}</div>
        </div>
      )}

      {question.constraints && (
        <div className="question-section">
          <h4>Constraints</h4>
          <ul>
            {question.constraints.time_ms && <li>Time: {question.constraints.time_ms}ms</li>}
            {question.constraints.memory_mb && <li>Memory: {question.constraints.memory_mb}MB</li>}
          </ul>
        </div>
      )}

      {question.public_tests && question.public_tests.length > 0 && (
        <div className="question-section">
          <h4>Examples</h4>
          {question.public_tests.slice(0, 3).map((t, i) => (
            <div key={i} className="test-example">
              <div className="test-label">Example {i + 1}</div>
              <div className="test-io">
                <div><strong>Input:</strong> <code>{JSON.stringify(t.input)}</code></div>
                <div><strong>Output:</strong> <code>{JSON.stringify(t.output)}</code></div>
              </div>
              {t.explanation && <div className="test-explanation">{t.explanation}</div>}
            </div>
          ))}
        </div>
      )}

      {question.edge_cases && question.edge_cases.length > 0 && (
        <div className="question-section">
          <h4>Edge Cases</h4>
          <ul>
            {question.edge_cases.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuestionPanel;
```

- [ ] **Step 3: Commit**

```bash
git add src/client/src/components/TimerBar.tsx src/client/src/components/QuestionPanel.tsx
git commit -m "feat: add TimerBar and QuestionPanel components"
```

---

### Task 5: Components - CodeEditor + OutputPanel

**Files:**
- Create: `src/client/src/components/CodeEditor.tsx`
- Create: `src/client/src/components/OutputPanel.tsx`

- [ ] **Step 1: Create CodeEditor.tsx**

```tsx
import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';

const LANGUAGES = [
  { value: 'python', label: 'Python', monacoLang: 'python' },
  { value: 'javascript', label: 'JavaScript', monacoLang: 'javascript' },
  { value: 'java', label: 'Java', monacoLang: 'java' },
  { value: 'c', label: 'C', monacoLang: 'c' },
  { value: 'cpp', label: 'C++', monacoLang: 'cpp' },
];

interface CodeEditorProps {
  code: string;
  language: string;
  onCodeChange: (code: string) => void;
  onEditorMount: (editor: any, monaco: any) => void;
  readOnly?: boolean;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, language, onCodeChange, onEditorMount, readOnly }) => {
  const monacoLang = LANGUAGES.find(l => l.value === language)?.monacoLang || 'python';

  return (
    <div className="code-editor-container">
      <Editor
        height="100%"
        language={monacoLang}
        value={code}
        onChange={(value) => onCodeChange(value || '')}
        onMount={onEditorMount}
        theme="vs-dark"
        options={{
          readOnly: readOnly || false,
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          acceptSuggestionOnEnter: 'off',
          tabCompletion: 'off',
          wordBasedSuggestions: 'off',
          renderValidationDecorations: 'on',
          folding: true,
          matchBrackets: 'always',
          autoClosingBrackets: 'languageDefined',
          autoClosingQuotes: 'languageDefined',
          insertSpaces: true,
          tabSize: 4,
          suggest: {
            showKeywords: false,
            showSnippets: false,
            showFunctions: false,
            showConstructors: false,
            showFields: false,
            showVariables: false,
            showClasses: false,
            showStructs: false,
            showInterfaces: false,
            showModules: false,
            showProperties: false,
            showEvents: false,
            showOperators: false,
            showUnits: false,
            showValues: false,
            showConstants: false,
            showEnums: false,
            showEnumMembers: false,
            showColors: false,
            showFiles: false,
            showReferences: false,
            showFolders: false,
            showTypeParameters: false,
            showIssues: false,
            showUsers: false,
            showWords: false,
          },
        }}
      />
    </div>
  );
};

export default CodeEditor;
```

- [ ] **Step 2: Create OutputPanel.tsx**

```tsx
import React from 'react';
import type { TestResult } from '../types';

interface OutputPanelProps {
  output: string;
  error: string;
  testResults: TestResult[];
  isRunning: boolean;
}

const OutputPanel: React.FC<OutputPanelProps> = ({ output, error, testResults, isRunning }) => {
  if (isRunning) {
    return (
      <div className="output-panel">
        <div className="output-loading">
          <div className="spinner" />
          <span>Executing code...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="output-panel">
      {output && (
        <div className="output-section">
          <h4>Output</h4>
          <pre className="output-text">{output}</pre>
        </div>
      )}

      {error && (
        <div className="output-section error">
          <h4>Error</h4>
          <pre className="output-text error-text">{error}</pre>
        </div>
      )}

      {testResults.length > 0 && (
        <div className="output-section">
          <h4>Test Results</h4>
          <div className="test-results">
            {testResults.map((t) => (
              <div key={t.testId} className={`test-result ${t.passed ? 'pass' : 'fail'}`}>
                <span className="test-status">{t.passed ? 'PASS' : 'FAIL'}</span>
                <span className="test-id">{t.testId}</span>
                {t.input !== null && (
                  <div className="test-detail">
                    <div>Input: <code>{JSON.stringify(t.input)}</code></div>
                    <div>Expected: <code>{JSON.stringify(t.expected)}</code></div>
                    {!t.passed && t.actual !== null && (
                      <div>Got: <code>{JSON.stringify(t.actual)}</code></div>
                    )}
                  </div>
                )}
                {t.input === null && !t.passed && (
                  <span className="test-hidden">(hidden test)</span>
                )}
              </div>
            ))}
          </div>
          <div className="test-summary">
            {testResults.filter(t => t.passed).length}/{testResults.length} passed
          </div>
        </div>
      )}

      {!output && !error && testResults.length === 0 && (
        <div className="output-placeholder">
          Click "Run" (Ctrl+Enter) to execute your code
        </div>
      )}
    </div>
  );
};

export default OutputPanel;
```

- [ ] **Step 3: Commit**

```bash
git add src/client/src/components/CodeEditor.tsx src/client/src/components/OutputPanel.tsx
git commit -m "feat: add CodeEditor and OutputPanel components"
```

---

### Task 6: InterviewerPanel (Text Chat)

**Files:**
- Create: `src/client/src/components/InterviewerPanel.tsx`

- [ ] **Step 1: Create InterviewerPanel.tsx**

```tsx
import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';

interface InterviewerPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const InterviewerPanel: React.FC<InterviewerPanelProps> = ({ messages, onSendMessage, isLoading }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    onSendMessage(text);
    setInputText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="interviewer-panel">
      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message ${msg.sender}`}>
            <div className="message-sender">
              {msg.sender === 'interviewer' ? 'Cortex' : 'You'}
            </div>
            <div className="message-text">{msg.text}</div>
            <div className="message-time">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="chat-message interviewer">
            <div className="message-sender">Cortex</div>
            <div className="message-text">
              <div className="typing-indicator">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Cortex anything..."
          disabled={isLoading}
          rows={2}
        />
        <button onClick={handleSend} disabled={isLoading || !inputText.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

export default InterviewerPanel;
```

- [ ] **Step 2: Commit**

```bash
git add src/client/src/components/InterviewerPanel.tsx
git commit -m "feat: add InterviewerPanel chat component"
```

---

### Task 7: EntryPage

**Files:**
- Create: `src/client/src/views/EntryPage.tsx`

- [ ] **Step 1: Create EntryPage.tsx**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface EntryPageProps {
  onStart: (name: string, email: string, language: string) => void;
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
];

const EntryPage: React.FC<EntryPageProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState('python');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onStart(name.trim(), email.trim(), language);
  };

  return (
    <div className="entry-page">
      <div className="entry-card">
        <h1>CORTEX</h1>
        <p className="entry-subtitle">Coding Interview</p>
        <p className="entry-welcome">Welcome! Before we begin, please introduce yourself.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name *</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>

          <div className="form-group">
            <label htmlFor="language">Preferred Language</label>
            <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}>
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="entry-button" disabled={!name.trim()}>
            Enter Interview Room
          </button>
        </form>
      </div>
    </div>
  );
};

export default EntryPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/client/src/views/EntryPage.tsx
git commit -m "feat: add EntryPage component"
```

---

### Task 8: InterviewPage (Main 3-Pane Layout)

**Files:**
- Create: `src/client/src/views/InterviewPage.tsx`

- [ ] **Step 1: Create InterviewPage.tsx**

This is the main layout. It manages state and wires all components together.

```tsx
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
import { runCode, submitCode } from '../api';
import type { QuestionItem, TestResult, ChatMessage, TimerSync } from '../types';

interface InterviewPageProps {
  sessionId: string;
  question: QuestionItem;
  initialCode: string;
  language: string;
  timeLimit: number;
  startTime: number;
  candidateName: string;
}

const LANGUAGES = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
];

const InterviewPage: React.FC<InterviewPageProps> = ({
  sessionId, question, initialCode, language: initialLang,
  timeLimit, startTime, candidateName,
}) => {
  const [code, setCode] = useState(initialCode);
  const [language, setLanguage] = useState(initialLang);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [timer, setTimer] = useState<TimerSync>({ elapsed: 0, remaining: timeLimit, percent: 0 });
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      text: `Hi ${candidateName}, I'm Cortex. I'll be your interviewer today. We have ${Math.round(timeLimit / 60000)} minutes together. Take a moment to read the problem on the left, and start coding whenever you're ready. Feel free to talk to me anytime!`,
      sender: 'interviewer',
      timestamp: new Date(),
    },
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const editorRef = useRef<any>(null);
  const telemetry = useTelemetry(sessionId);

  // Tab visibility tracking
  useTabVisibility(sessionId, startTime);

  // Pane resize state
  const [leftPct, setLeftPct] = useState(25);
  const [rightPct, setRightPct] = useState(25);
  const [middleSplitPct, setMiddleSplitPct] = useState(60);

  // Timer sync from server
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: TimerSync) => setTimer(data);
    socket.on('timer-sync', handler);

    const timeoutHandler = () => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Time's up! Thanks for your effort today.",
        sender: 'interviewer',
        timestamp: new Date(),
      }]);
    };
    socket.on('session-timeout', timeoutHandler);

    // Interviewer messages from server
    const msgHandler = (data: { text: string; trigger: string }) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: data.text,
        sender: 'interviewer',
        timestamp: new Date(),
        trigger: data.trigger,
      }]);
    };
    socket.on('interviewer-message', msgHandler);

    return () => {
      socket.off('timer-sync', handler);
      socket.off('session-timeout', timeoutHandler);
      socket.off('interviewer-message', msgHandler);
    };
  }, []);

  // Set session start time for telemetry
  useEffect(() => {
    telemetry.setSessionStart(startTime);
  }, [startTime, telemetry]);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;

    const model = editor.getModel();
    if (!model) return;

    model.onDidChangeContent((e: any) => {
      telemetry.recordEdit(e.changes || [], e.isUndoing, e.isRedoing);

      // Record line updates for changed lines
      for (const change of e.changes || []) {
        for (let i = change.range.startLineNumber; i <= Math.min(change.range.endLineNumber, model.getLineCount()); i++) {
          try {
            const content = model.getLineContent(i);
            telemetry.recordLineUpdate(i, content);
          } catch {}
        }
      }
    });

    editor.onDidBlurEditorText(() => telemetry.forceFlush());
  }, [telemetry]);

  const handleRun = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    setIsRunning(true);
    setOutput('');
    setError('');
    setTestResults([]);

    try {
      const result = await runCode(language, code, question.id);
      setOutput(result.output || '');
      setError(result.error || '');
      setTestResults(result.testResults || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to execute code.');
    } finally {
      setIsRunning(false);
    }
  }, [code, language, question.id, isRunning]);

  const handleSubmit = useCallback(async () => {
    if (isRunning || !code.trim()) return;
    setIsRunning(true);
    setOutput('');
    setError('');
    setTestResults([]);

    try {
      const result = await submitCode(language, code, question.id);
      setError(result.error || '');
      setTestResults(result.testResults || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit code.');
    } finally {
      setIsRunning(false);
    }
  }, [code, language, question.id, isRunning]);

  // Keyboard shortcuts
  useKeyboardShortcuts(handleRun, handleSubmit, editorRef);

  const handleSendMessage = useCallback((text: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsChatLoading(true);

    const socket = getSocket();
    socket.emit('chat-message', { sessionId, text });

    // The response will come via 'interviewer-message' event
    // Set a timeout to clear loading state if no response
    setTimeout(() => setIsChatLoading(false), 15000);
  }, [sessionId]);

  // Clear chat loading when interviewer responds
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.sender === 'interviewer') {
      setIsChatLoading(false);
    }
  }, [messages]);

  // Drag handlers for pane resizing
  const isDraggingLeftRef = useRef(false);
  const isDraggingRightRef = useRef(false);
  const isDraggingMidRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartYRef = useRef(0);
  const dragStartPctRef = useRef(0);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const container = document.getElementById('interview-container');
      if (!container) return;
      const rect = container.getBoundingClientRect();

      if (isDraggingLeftRef.current) {
        const deltaPct = ((e.clientX - dragStartXRef.current) / rect.width) * 100;
        setLeftPct(Math.max(15, Math.min(40, dragStartPctRef.current + deltaPct)));
      }
      if (isDraggingRightRef.current) {
        const deltaPct = ((dragStartXRef.current - e.clientX) / rect.width) * 100;
        setRightPct(Math.max(15, Math.min(40, dragStartPctRef.current + deltaPct)));
      }
      if (isDraggingMidRef.current) {
        const mid = document.getElementById('middle-pane');
        if (!mid) return;
        const mRect = mid.getBoundingClientRect();
        const deltaPct = ((e.clientY - dragStartYRef.current) / mRect.height) * 100;
        setMiddleSplitPct(Math.max(30, Math.min(80, dragStartPctRef.current + deltaPct)));
      }
    };
    const onMouseUp = () => {
      isDraggingLeftRef.current = false;
      isDraggingRightRef.current = false;
      isDraggingMidRef.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div className="interview-page">
      <header className="interview-header">
        <div className="header-left">
          <h2>Cortex</h2>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="lang-select">
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div className="header-right">
          <button className="btn btn-run" onClick={handleRun} disabled={isRunning}>
            {isRunning ? 'Running...' : 'Run (Ctrl+Enter)'}
          </button>
          <button className="btn btn-submit" onClick={handleSubmit} disabled={isRunning}>
            Submit (Ctrl+Shift+Enter)
          </button>
        </div>
      </header>

      <TimerBar elapsed={timer.elapsed} remaining={timer.remaining} percent={timer.percent} />

      <div id="interview-container" className="interview-container">
        <div className="pane pane-left" style={{ width: `${leftPct}%` }}>
          <div className="pane-header">Problem</div>
          <div className="pane-content">
            <QuestionPanel question={question} />
          </div>
        </div>

        <div
          className="gutter gutter-vertical"
          onMouseDown={(e) => {
            dragStartXRef.current = e.clientX;
            dragStartPctRef.current = leftPct;
            isDraggingLeftRef.current = true;
          }}
        />

        <div id="middle-pane" className="pane pane-middle" style={{ width: `${100 - leftPct - rightPct}%` }}>
          <div className="middle-top" style={{ height: `${middleSplitPct}%` }}>
            <CodeEditor
              code={code}
              language={language}
              onCodeChange={setCode}
              onEditorMount={handleEditorMount}
            />
          </div>
          <div
            className="gutter gutter-horizontal"
            onMouseDown={(e) => {
              dragStartYRef.current = e.clientY;
              dragStartPctRef.current = middleSplitPct;
              isDraggingMidRef.current = true;
            }}
          />
          <div className="middle-bottom" style={{ height: `${100 - middleSplitPct}%` }}>
            <OutputPanel output={output} error={error} testResults={testResults} isRunning={isRunning} />
          </div>
        </div>

        <div
          className="gutter gutter-vertical"
          onMouseDown={(e) => {
            dragStartXRef.current = e.clientX;
            dragStartPctRef.current = rightPct;
            isDraggingRightRef.current = true;
          }}
        />

        <div className="pane pane-right" style={{ width: `${rightPct}%` }}>
          <div className="pane-header">Interviewer</div>
          <div className="pane-content">
            <InterviewerPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isChatLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default InterviewPage;
```

- [ ] **Step 2: Commit**

```bash
git add src/client/src/views/InterviewPage.tsx
git commit -m "feat: add InterviewPage 3-pane layout"
```

---

### Task 9: App.tsx + Styles + Routing

**Files:**
- Create: `src/client/src/App.tsx`
- Create: `src/client/src/styles/App.css`

- [ ] **Step 1: Create App.tsx**

```tsx
import React, { useState, useCallback } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import EntryPage from './views/EntryPage';
import InterviewPage from './views/InterviewPage';
import { getSocket } from './socket';
import { useSessionRecovery } from './hooks/useSessionRecovery';
import type { QuestionItem, SessionCreated } from './types';

function App() {
  const navigate = useNavigate();
  const { restoredSession, restoredSessionId, saveSessionId, clearSessionId } = useSessionRecovery();
  const [interviewData, setInterviewData] = useState<{
    sessionId: string;
    question: QuestionItem;
    initialCode: string;
    language: string;
    timeLimit: number;
    startTime: number;
    candidateName: string;
  } | null>(null);

  const handleStart = useCallback((name: string, email: string, language: string) => {
    const socket = getSocket();

    socket.emit('start-session', {
      candidateName: name,
      candidateEmail: email,
      language,
      questionId: null, // Server picks the first question
    });

    socket.once('session-created', (data: SessionCreated) => {
      saveSessionId(data.sessionId);
      setInterviewData({
        sessionId: data.sessionId,
        question: data.question,
        initialCode: data.initialCode,
        language,
        timeLimit: data.timeLimit,
        startTime: data.startTime,
        candidateName: name,
      });
      navigate('/interview');
    });
  }, [navigate, saveSessionId]);

  // Handle restored session
  React.useEffect(() => {
    if (restoredSession && restoredSessionId) {
      // For now, show entry page again -- full recovery will be done in Plan 8
      // The session data is available via restoredSession
    }
  }, [restoredSession, restoredSessionId]);

  return (
    <Routes>
      <Route path="/" element={<EntryPage onStart={handleStart} />} />
      <Route
        path="/interview"
        element={
          interviewData ? (
            <InterviewPage {...interviewData} />
          ) : (
            <EntryPage onStart={handleStart} />
          )
        }
      />
    </Routes>
  );
}

export default App;
```

- [ ] **Step 2: Create styles/App.css**

Create a comprehensive stylesheet. This file is large but essential:

```css
/* ===== Global Reset & Variables ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg-primary: #0d1117;
  --bg-secondary: #161b22;
  --bg-tertiary: #1c2333;
  --text-primary: #e6edf3;
  --text-secondary: #8b949e;
  --accent: #58a6ff;
  --accent-hover: #79c0ff;
  --success: #3fb950;
  --error: #f85149;
  --warning: #d29922;
  --border: #30363d;
  --gutter: #21262d;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-primary);
  color: var(--text-primary);
  overflow: hidden;
  height: 100vh;
}

#root { height: 100vh; display: flex; flex-direction: column; }

/* ===== Entry Page ===== */
.entry-page {
  display: flex; align-items: center; justify-content: center;
  height: 100vh; background: var(--bg-primary);
}
.entry-card {
  background: var(--bg-secondary); border: 1px solid var(--border);
  border-radius: 12px; padding: 48px; width: 420px; text-align: center;
}
.entry-card h1 { font-size: 32px; letter-spacing: 4px; margin-bottom: 4px; color: var(--accent); }
.entry-subtitle { color: var(--text-secondary); margin-bottom: 24px; }
.entry-welcome { color: var(--text-secondary); margin-bottom: 32px; font-size: 14px; }
.form-group { margin-bottom: 16px; text-align: left; }
.form-group label { display: block; font-size: 13px; color: var(--text-secondary); margin-bottom: 6px; }
.form-group input, .form-group select {
  width: 100%; padding: 10px 12px; background: var(--bg-tertiary);
  border: 1px solid var(--border); border-radius: 6px; color: var(--text-primary);
  font-size: 14px; outline: none;
}
.form-group input:focus, .form-group select:focus { border-color: var(--accent); }
.entry-button {
  width: 100%; padding: 12px; margin-top: 16px; background: var(--accent);
  color: #fff; border: none; border-radius: 6px; font-size: 16px;
  cursor: pointer; font-weight: 600;
}
.entry-button:hover { background: var(--accent-hover); }
.entry-button:disabled { opacity: 0.5; cursor: not-allowed; }

/* ===== Interview Page ===== */
.interview-page { display: flex; flex-direction: column; height: 100vh; }

.interview-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 16px; background: var(--bg-secondary); border-bottom: 1px solid var(--border);
}
.header-left { display: flex; align-items: center; gap: 16px; }
.header-left h2 { font-size: 18px; color: var(--accent); letter-spacing: 2px; }
.lang-select {
  padding: 6px 10px; background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-primary); font-size: 13px;
}
.header-right { display: flex; gap: 8px; }
.btn {
  padding: 8px 16px; border: none; border-radius: 4px; font-size: 13px;
  cursor: pointer; font-weight: 500;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-run { background: var(--success); color: #fff; }
.btn-run:hover:not(:disabled) { background: #2ea043; }
.btn-submit { background: var(--accent); color: #fff; }
.btn-submit:hover:not(:disabled) { background: var(--accent-hover); }

/* ===== Timer Bar ===== */
.timer-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 4px 16px; background: var(--bg-secondary);
  border-bottom: 1px solid var(--border); font-size: 13px;
}
.timer-text { color: var(--text-secondary); min-width: 100px; }
.timer-progress {
  flex: 1; height: 6px; background: var(--bg-tertiary);
  border-radius: 3px; overflow: hidden;
}
.timer-fill { height: 100%; background: var(--success); border-radius: 3px; transition: width 0.3s; }
.timer-bar.caution .timer-fill { background: var(--warning); }
.timer-bar.urgent .timer-fill { background: var(--error); animation: pulse 2s infinite; }
.timer-percent { color: var(--text-secondary); min-width: 40px; text-align: right; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }

/* ===== 3-Pane Layout ===== */
.interview-container {
  flex: 1; display: flex; overflow: hidden;
}
.pane { display: flex; flex-direction: column; overflow: hidden; }
.pane-left, .pane-right { background: var(--bg-secondary); }
.pane-middle { background: var(--bg-primary); }
.pane-header {
  padding: 8px 12px; font-size: 12px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 1px;
  color: var(--text-secondary); border-bottom: 1px solid var(--border);
  background: var(--bg-tertiary);
}
.pane-content { flex: 1; overflow-y: auto; padding: 12px; }

/* Gutters */
.gutter { background: var(--gutter); flex-shrink: 0; }
.gutter-vertical { width: 4px; cursor: col-resize; }
.gutter-vertical:hover { background: var(--accent); }
.gutter-horizontal { height: 4px; cursor: row-resize; }
.gutter-horizontal:hover { background: var(--accent); }

/* Middle pane split */
.middle-top, .middle-bottom { overflow: hidden; }
.middle-top { display: flex; flex-direction: column; }
.middle-bottom { overflow-y: auto; }

/* ===== Code Editor ===== */
.code-editor-container { flex: 1; }

/* ===== Question Panel ===== */
.question-panel { font-size: 14px; line-height: 1.6; }
.question-panel h3 { margin-bottom: 8px; }
.question-meta { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.difficulty-badge {
  padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;
  text-transform: uppercase;
}
.difficulty-badge.easy { background: #1a4731; color: var(--success); }
.difficulty-badge.medium { background: #3d2e00; color: var(--warning); }
.difficulty-badge.hard { background: #4a1518; color: var(--error); }
.concept-badge {
  padding: 2px 8px; border-radius: 12px; font-size: 11px;
  background: var(--bg-tertiary); color: var(--text-secondary);
}
.question-desc { color: var(--text-secondary); margin-bottom: 16px; }
.question-section { margin-bottom: 16px; }
.question-section h4 { font-size: 13px; margin-bottom: 6px; color: var(--accent); }
.question-text { white-space: pre-wrap; }
.test-example {
  border: 1px solid var(--border); border-radius: 6px;
  padding: 8px; margin-bottom: 8px;
}
.test-label { font-size: 11px; color: var(--text-secondary); margin-bottom: 4px; }
.test-io code { font-size: 12px; color: var(--accent); }
.test-explanation { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }

/* ===== Output Panel ===== */
.output-panel { padding: 12px; font-size: 13px; height: 100%; overflow-y: auto; }
.output-loading { display: flex; align-items: center; gap: 8px; color: var(--text-secondary); }
.spinner {
  width: 16px; height: 16px; border: 2px solid var(--border);
  border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.output-section { margin-bottom: 12px; }
.output-section h4 { font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.output-text { font-family: monospace; font-size: 13px; white-space: pre-wrap; padding: 8px; background: var(--bg-tertiary); border-radius: 4px; }
.error-text { color: var(--error); }
.output-placeholder { color: var(--text-secondary); text-align: center; padding: 24px; }

.test-results { display: flex; flex-direction: column; gap: 6px; }
.test-result {
  padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border);
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
}
.test-result.pass { border-color: var(--success); }
.test-result.fail { border-color: var(--error); }
.test-status { font-weight: 700; font-size: 11px; }
.test-result.pass .test-status { color: var(--success); }
.test-result.fail .test-status { color: var(--error); }
.test-id { font-size: 12px; color: var(--text-secondary); }
.test-detail { width: 100%; font-size: 12px; margin-top: 4px; }
.test-detail code { color: var(--accent); }
.test-hidden { font-size: 11px; color: var(--text-secondary); font-style: italic; }
.test-summary { margin-top: 8px; font-size: 12px; color: var(--text-secondary); }

/* ===== Interviewer Panel ===== */
.interviewer-panel { display: flex; flex-direction: column; height: 100%; }
.chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.chat-message { padding: 8px 0; }
.chat-message.interviewer .message-sender { color: var(--accent); font-weight: 600; }
.chat-message.user .message-sender { color: var(--success); font-weight: 600; }
.message-sender { font-size: 11px; margin-bottom: 2px; }
.message-text { font-size: 14px; line-height: 1.5; }
.message-time { font-size: 10px; color: var(--text-secondary); margin-top: 2px; }

.typing-indicator { display: flex; gap: 4px; padding: 4px 0; }
.typing-indicator span {
  width: 6px; height: 6px; background: var(--text-secondary);
  border-radius: 50%; animation: bounce 1.4s infinite;
}
.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
@keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

.chat-input-area { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); }
.chat-input-area textarea {
  flex: 1; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border);
  border-radius: 4px; color: var(--text-primary); font-size: 13px; resize: none;
  font-family: inherit; outline: none;
}
.chat-input-area textarea:focus { border-color: var(--accent); }
.chat-input-area button {
  padding: 8px 16px; background: var(--accent); color: #fff;
  border: none; border-radius: 4px; cursor: pointer; font-size: 13px; align-self: flex-end;
}
.chat-input-area button:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Commit**

```bash
git add src/client/src/App.tsx src/client/src/styles/App.css
git commit -m "feat: add App routing and complete stylesheet"
```

---

### Task 10: Verify Build

- [ ] **Step 1: Test the React app builds**

Run: `cd /Users/shipsy/Desktop/gen-ai-project/src/client && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 2: Test server still passes all tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test`
Expected: All 38 server tests pass

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: Plan 3 complete - frontend interview UI"
```
