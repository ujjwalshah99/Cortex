# Cortex - Architecture Overview

This document provides a visual walkthrough of every component, how they connect, and what data flows between them.

---

## 1. System Architecture

```
+================================================================+
|                     CANDIDATE'S BROWSER                         |
|                                                                 |
|  +-------------+  +------------------+  +--------------------+  |
|  |  QUESTION   |  |  MONACO EDITOR   |  |   INTERVIEWER      |  |
|  |  PANEL      |  |  + OUTPUT PANEL  |  |   PANEL (Chat)     |  |
|  |             |  |  + TEST RESULTS  |  |                    |  |
|  |  - Problem  |  |                  |  |  Cortex: "Hi, I'm  |  |
|  |  - Examples |  |  [Run] [Submit]  |  |  your interviewer" |  |
|  |  - Edge     |  |                  |  |                    |  |
|  |    cases    |  |                  |  |  You: "help?"      |  |
|  +-------------+  +------------------+  +--------------------+  |
|                                                                 |
|  [===================  Timer Bar  =================== 55%]      |
|                                                                 |
|  Hooks: useTelemetry | useKeyboardShortcuts | useTabVisibility  |
+================================================================+
                              |
                         Socket.io + REST
                              |
+================================================================+
|                      NODE.JS SERVER                             |
|                                                                 |
|  +----------------------------------------------------------+  |
|  |                    Socket Handler                         |  |
|  |  Events: start-session | telemetry | chat-message |       |  |
|  |          run-code | reconnect-session                     |  |
|  +----+-------------------+-------------------+--------------+  |
|       |                   |                   |                 |
|       v                   v                   v                 |
|  +---------+    +------------------+    +----------------+      |
|  | Session |    |   Heuristic      |    | Interviewer    |      |
|  | Manager |    |   Engine         |    | Brain          |      |
|  |         |    |                  |    |                |      |
|  | In-mem  |    | 7 signals -->    |    | Priority Queue |      |
|  | state   |<-->| Stuck Index S    |--->| Prompt Builder |      |
|  | + write |    | + help_level     |    | Output Validate|      |
|  | buffer  |    |                  |    |                |      |
|  +----+----+    +--------+---------+    +-------+--------+      |
|       |                  |                      |               |
|       v                  v                      v               |
|  +---------+    +------------------+    +----------------+      |
|  | Write   |    | SLM Gateway      |    | Prompt Guard   |      |
|  | Buffer  |    | (Gemini Flash)   |    | + Rate Limiter |      |
|  | Flusher |    | Conditional call |    |                |      |
|  | (5s)    |    | only when S near |    | 8 regex blocks |      |
|  +---------+    | threshold        |    | Code leak strip|      |
|       |         +------------------+    +----------------+      |
|       |                  |                                      |
|       v                  v                                      |
|  +---------+    +------------------+    +----------------+      |
|  | Code    |    | Snapshot Loop    |    | RL Feedback    |      |
|  | Runner  |    | (30s server-side)|    | Logger         |      |
|  | (Docker)|    | Heuristic + SLM  |    | 3-min observe  |      |
|  +---------+    +------------------+    +-------+--------+      |
|       |                  |                      |               |
|       v                  v                      v               |
|  +---------+    +------------------+    +----------------+      |
|  | Test    |    | Timer Service    |    | Summary        |      |
|  | Case    |    | Per-session      |    | Generator      |      |
|  | Runner  |    | countdown + sync |    | Post-session   |      |
|  +---------+    +------------------+    | LLM evaluation |      |
|                                         +----------------+      |
|                                                                 |
|  REST Routes: /api/run | /api/check | /api/submit |             |
|               /api/questions | /api/sessions | /api/health      |
+================================================================+
         |              |                |
         v              v                v
   +----------+   +-----------+   +-------------+
   | Docker   |   | MongoDB   |   | Gemini API  |
   | Engine   |   | Atlas     |   | (Flash)     |
   |          |   |           |   |             |
   | Python   |   | sessions  |   | SLM calls   |
   | Node.js  |   | snapshots |   | Chat calls  |
   | Java     |   | chat_logs |   | Summary     |
   | C / C++  |   | rl_feed   |   |             |
   +----------+   +-----------+   +-------------+
```

---

## 2. Request Flow Diagrams

### 2.1 Interview Start

```
Candidate clicks "Enter Interview Room"
         |
         v
Client: emit('start-session', {name, email, language})
         |
         v
Server: Socket Handler
    |
    +-- Find question from questions.json
    +-- Get canonical_skeleton for language --> initialCode
    +-- createSession() in sessionManager (in-memory)
    +-- Session.create() in MongoDB (persistence)
    +-- socket.join(sessionId)
    +-- createTimer(sessionId, startTime, timeLimit)
    +-- Start 10s timer-sync interval
    |
    v
Server: emit('session-created', {sessionId, question, initialCode, timeLimit})
         |
         v
Client: Store sessionId in localStorage
         Navigate to /interview
         Render 3-pane layout
         Display greeting from Cortex
         Start telemetry engine
```

### 2.2 Keystroke Telemetry

```
Candidate types a character
         |
         v
Monaco: onDidChangeContent fires
         |
    +----+----+
    |         |
    v         v
EDIT event   LINE_UPDATE
(raw change) (full line content)
    |         |
    +----+----+
         |
    Buffer (350ms debounce, or 25 events)
         |
         v
Client: emit('telemetry', {sessionId, edits, lineUpdates, lineMetrics, pasteEvents})
         |
         v
Server: applyTelemetry()
    |
    +-- Update in-memory session state (instant)
    +-- Add to write buffer
    |
    v
Write Buffer Flusher (every 5s)
    |
    v
MongoDB: $push events, lineHistory updates (batched)
```

### 2.3 Struggle Detection

```
Every 30 seconds (server-side):
         |
         v
Snapshot Loop: processSnapshot()
    |
    +-- Tier 1: computeStuckIndex(state)
    |   Pure math: S = weighted sum of 7 signals
    |   Derive helpLevel from S
    |
    +-- S < (T - 15)?
    |   YES --> Save metrics-only snapshot to MongoDB
    |           (no LLM call, 0 cost)
    |
    +-- S >= (T - 15)?  (warm zone or threshold breach)
    |   YES --> Tier 2: evaluateWithSLM(state, metrics)
    |           Call Gemini Flash with condensed state log
    |           |
    |           +-- should_call_llm = false?
    |           |   Log as false positive, bump cooldown
    |           |
    |           +-- should_call_llm = true?
    |               AND no active observation window?
    |               |
    |               +-- markEscalation(sessionId)
    |               +-- state._pendingProactiveGuidance = true
    |               +-- enqueueEvent(PROACTIVE_GUIDANCE)
    |               +-- processQueue() --> callGemini()
    |               +-- emit('interviewer-message', {text})
    |               +-- logInterventionStart() (3-min observation)
```

### 2.4 Candidate Chats with Interviewer

```
Candidate types: "What data structure should I use?"
         |
         v
Client: emit('chat-message', {sessionId, text})
         |
         v
Server: Socket Handler
    |
    +-- checkRateLimit(state)
    |   THROTTLED? --> emit refusal message, return
    |
    +-- sanitizeInput(text)
    |   BLOCKED? --> emit polite refusal, apply 5-min cooldown, return
    |
    +-- Increment messageCount
    +-- enqueueEvent(CANDIDATE_MESSAGE, priority: 3)
    +-- processQueue():
    |   |
    |   +-- Build full context prompt (~4500 tokens)
    |   +-- callGemini(prompt, INTERVIEWER_SYSTEM_PROMPT)
    |   +-- extractOutputChat(response)
    |   +-- validateOutput(text)
    |   |   |
    |   |   +-- Code block detected? Strip it, append disclaimer
    |   |
    |   +-- ChatLog.create() in MongoDB
    |   +-- emit('interviewer-message', {text, trigger})
    |
    v
Client: Display message in InterviewerPanel
```

### 2.5 Code Execution

```
Candidate clicks Run (or Ctrl+Enter)
         |
         v
Client: POST /api/run {language, code, questionId}
         |
         v
Server: execution.js route
    |
    +-- Write code to tmp/<uuid>/main.py
    +-- docker run --rm --cpus=0.5 --memory=256m --network=none ...
    |   (all test inputs piped via stdin as JSON array)
    +-- Capture stdout + stderr
    +-- Cleanup tmp/<uuid>
    +-- Parse JSON output array
    +-- Compare each result vs expected (order-insensitive)
    +-- Return {output, error, testResults}
         |
         v
Client: Display in OutputPanel
    |
    +-- Also: emit('run-code', {sessionId, output, error, testResults})
         |
         v
Server: Socket Handler (smart filtering)
    |
    +-- Is this meaningful? (first run, new error, breakthrough, test count changed)
    |   NO --> skip (don't waste LLM call)
    |   YES --> enqueueEvent(CODE_RUN, priority: 2)
    |           processQueue() --> callGemini() with minimal context
    |           emit('interviewer-message', {text, trigger: 'CODE_RUN'})
```

### 2.6 Session End + Summary

```
Timer expires (or candidate submits final problem)
         |
         v
Server: Timer callback fires
    |
    +-- stopSession(sessionId, 'timeout')
    +-- emit('session-timeout')
    +-- forceFlush all pending writes to MongoDB
    +-- generateInterviewSummary(sessionId):
    |   |
    |   +-- Query: Session, Snapshot (last 5), RLFeedback
    |   +-- Build summary prompt (final code, test results,
    |   |   struggle trajectory, interventions, paste/tab events)
    |   +-- callGemini(prompt, SUMMARY_SYSTEM_PROMPT)
    |   +-- Parse JSON: {summary, strengths, weaknesses, rating}
    |   +-- Session.updateOne({interviewSummary: ...})
    |   +-- Fallback: data-only summary if LLM fails
    |
    +-- emit('session-ended', {interviewSummary})
         |
         v
Client: Display summary, clear localStorage
```

---

## 3. Module Dependency Graph

```
index.js
  +-- db/connection.js
  +-- routes/execution.js
  |     +-- services/codeRunner.js
  |     |     +-- config/defaults.js
  |     +-- services/testCaseRunner.js
  |           +-- services/codeRunner.js
  +-- routes/questions.js
  +-- routes/sessions.js
  |     +-- db/models/Session.js
  |     +-- db/models/ChatLog.js
  +-- socket/handler.js
  |     +-- services/sessionManager.js
  |     +-- services/timerService.js
  |     +-- services/writeBufferFlusher.js
  |     |     +-- db/models/Session.js
  |     |     +-- services/sessionManager.js
  |     +-- services/promptGuard.js
  |     +-- services/interviewerBrain.js
  |     |     +-- utils/gemini.js
  |     |     +-- db/models/ChatLog.js
  |     |     +-- services/promptGuard.js
  |     |     +-- services/timerService.js
  |     +-- services/summaryGenerator.js
  |           +-- utils/gemini.js
  |           +-- db/models/Session.js
  |           +-- db/models/Snapshot.js
  |           +-- db/models/RLFeedback.js
  +-- services/snapshotLoop.js
  |     +-- services/sessionManager.js
  |     +-- services/heuristicEngine.js
  |     |     +-- config/defaults.js
  |     +-- services/slmGateway.js
  |     |     +-- utils/gemini.js
  |     |     +-- db/models/Snapshot.js
  |     +-- services/rlFeedbackLogger.js
  |           +-- db/models/RLFeedback.js
  |           +-- services/sessionManager.js
  +-- services/writeBufferFlusher.js
```

---

## 4. Background Services

Three `setInterval` loops run concurrently on the server:

| Service | Interval | What It Does |
|---|---|---|
| **Snapshot Loop** | 30 seconds | Reads in-memory state, runs heuristic, conditionally calls SLM, saves snapshot to MongoDB |
| **Write Buffer Flusher** | 5 seconds | Drains per-session write buffers, batches `$push` operations to MongoDB |
| **Timer Sync** | 10 seconds (per session) | Computes elapsed/remaining time, pushes `timer-sync` event to client |

All three are started in `index.js` after MongoDB connects and the server starts listening. They are stopped on SIGTERM with a final `forceFlushAll()` to ensure no data is lost.

---

## 5. Client-Side Architecture

```
App.tsx (Routes)
  |
  +-- EntryPage.tsx
  |     Form: name, email, language
  |     On submit: socket.emit('start-session')
  |
  +-- InterviewPage.tsx (3-pane layout)
  |     |
  |     +-- QuestionPanel.tsx (left pane)
  |     |     Renders problem, examples, constraints, edge cases
  |     |
  |     +-- CodeEditor.tsx (middle top)
  |     |     Monaco editor, all autocomplete disabled
  |     |     onDidChangeContent --> useTelemetry hook
  |     |
  |     +-- OutputPanel.tsx (middle bottom)
  |     |     Run output, errors, test results (pass/fail per case)
  |     |
  |     +-- InterviewerPanel.tsx (right pane)
  |     |     Chat messages, typing indicator, input textarea
  |     |
  |     +-- TimerBar.tsx (top)
  |           Elapsed/total, progress bar, urgency colors
  |
  +-- AnalyticsListPage.tsx
  |     Table: candidate, language, duration, tests, rating
  |
  +-- AnalyticsDetailPage.tsx
        Summary card, test results, code replay, chat history

Hooks:
  useTelemetry.ts        -- captures edits, line updates, metrics, pastes, batches to server
  useKeyboardShortcuts.ts -- Ctrl+Enter (run), Ctrl+Shift+Enter (submit), Escape (focus editor)
  useTabVisibility.ts    -- TAB_AWAY/TAB_RETURN events via document.visibilitychange
  useSessionRecovery.ts  -- localStorage persistence + reconnect on page load

Shared:
  socket.ts  -- Socket.io client singleton
  api.ts     -- REST API client (axios)
  types.ts   -- TypeScript interfaces for all data shapes
```

---

## 6. Data Lifecycle

```
KEYSTROKE
  |
  v
CLIENT (350ms batch) -----> SERVER (in-memory, instant)
                               |
                          WRITE BUFFER (5s flush) -----> MONGODB (sessions.events)
                               |
                          SNAPSHOT LOOP (30s) -----> MONGODB (snapshots)
                               |
                          HEURISTIC (S computed)
                               |
                          SLM (conditional) -----> MONGODB (snapshots with SLM data)
                               |
                          INTERVIEWER BRAIN -----> MONGODB (chat_logs)
                               |                    |
                          RL LOGGER (3-min) -----> MONGODB (rl_feedback)
                               |
                          SESSION END -----> SUMMARY GENERATOR -----> MONGODB (sessions.interviewSummary)
```

Every piece of data flows through a clear pipeline: capture --> buffer --> persist --> analyze --> respond --> log. Nothing is lost, everything is queryable.
