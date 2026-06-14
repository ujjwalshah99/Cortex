# Cortex - AI Coding Interviewer

Cortex is a real-time AI coding interviewer that behaves like a human sitting next to the candidate. It watches them code, notices when they're stuck, asks probing questions to guide their thinking, answers questions when asked, and writes an evaluation when the interview is over.

The candidate never sees the machinery behind the scenes. They just see an interviewer who is attentive, helpful, and fair.

---

## How It Works (Complete Workflow)

### Step 1: Candidate Enters the Interview Room

The candidate opens the interview URL and sees an entry screen asking for their name, email, and preferred programming language. They click "Enter Interview Room."

Behind the scenes:
- A WebSocket connection is established via Socket.io
- A session is created in-memory and persisted to MongoDB Atlas
- A countdown timer starts (default: 45 minutes)
- The question is loaded from the question bank
- The code editor is pre-populated with a function skeleton so the candidate knows exactly what to implement

The interviewer greets the candidate by name:

> "Hi John, I'm Cortex. I'll be your interviewer today. We have 45 minutes together. Take a moment to read the problem on the left, and start coding whenever you're ready. Feel free to talk to me anytime!"

### Step 2: Candidate Writes Code (Telemetry Streams)

Every keystroke the candidate types is captured by the Monaco editor and streamed to the server via WebSocket. The telemetry includes:

- **EDIT events** -- raw keystroke changes (range, text inserted, text deleted)
- **LINE_UPDATE events** -- full content of each changed line (versioned)
- **LINE_METRICS events** -- behavioral signals per line:
  - `activeMs` -- time spent actively editing this line
  - `idleMs` -- time spent idle on this line
  - `churnRatio` -- keystrokes / final characters (1.0 = perfect typing, >2.0 = lots of rewrites)
  - `undoCount` -- how many Ctrl+Z on this line
  - `delayOutlier` -- abnormally long pause before typing
  - `keystrokeRate` -- characters per second
- **PASTE events** -- detected when >50 characters with newlines are inserted at once
- **TAB_AWAY / TAB_RETURN events** -- when the candidate switches browser tabs

This telemetry is batched client-side (every 350ms) and sent to the server. The server applies it instantly to in-memory session state, then buffers writes to MongoDB Atlas every 5 seconds to reduce database load.

### Step 3: Struggle Detection (2-Tier Pipeline)

Every 30 seconds, the server runs a detection pipeline to determine if the candidate is struggling:

**Tier 1: Heuristic Engine (pure math, <5ms, free)**

Computes a Stuck Index (S) from 7 weighted signals:

```
S = (w1 x idlePercent) + (w2 x churnRatio) + (w3 x failureStreak)
  + (w4 x delayOutlierFreq) + (w5 x undoFrequency)
  + (w6 x keystrokeRateDrop) + (w7 x sameLineOscillation)
```

Each signal is normalized to 0-100. The weights are tunable and refined by the RL feedback loop over time.

The threshold T varies by problem difficulty:
- Easy: T = 70 (more patience, higher bar)
- Medium: T = 55
- Hard: T = 40 (earlier intervention)

Rules:
- **Grace period**: Heuristic is disabled for the first 90 seconds (not enough data)
- **Anti-spam**: Minimum 60 seconds between escalations
- **Thinking vs Stuck**: Long idle followed by confident typing (low churn) = thinking. Frequent short idles + high churn + undos + same-line edits = stuck.

**Tier 2: SLM Gatekeeper (conditional Gemini Flash call)**

The SLM is NOT called every 30 seconds. It's only called when:
- S crosses the threshold T (heuristic fires), OR
- S enters the "warm zone" (within 15 points of T)

A typical 45-minute session makes 5-10 SLM calls total, not 90.

The SLM receives a condensed state log (code, metrics, recent errors, line history) and returns:
```json
{"should_call_llm": true, "reasoning": "Step-by-step analysis..."}
```

If the SLM confirms struggle, the system triggers proactive interviewer guidance.

### Step 4: The Interviewer Speaks

When struggle is detected, or when the candidate asks a question, the Interviewer Brain (LLM) generates a response.

**Two modes of interaction:**

**A) Candidate talks to the interviewer (candidate-initiated):**
The candidate can type anything in the chat panel. Cortex responds naturally, like a real interviewer.

**B) Interviewer proactively engages (system-initiated):**
When the detection pipeline confirms struggle, the LLM generates a natural interviewer response. It doesn't announce "I detected you're struggling" -- it just asks a probing question or offers guidance.

The depth of guidance scales with the help_level (derived from Stuck Index):

| S < 25 | Level 0 | No guidance needed |
|---|---|---|
| 25-50 | Level 1 (Nudge) | "What data structure would give you O(1) lookups?" |
| 50-75 | Level 2 (Guide) | "Consider using a hash map. As you iterate, store each number..." |
| 75+ | Level 3 (Direction) | "Create an empty dictionary. Loop through with enumerate. For each value, compute target minus that value..." |

The LLM uses `hint_templates` from the question JSON as a base and personalizes them based on the candidate's actual code and where they're stuck.

**Smart CODE_RUN filtering:**
The interviewer doesn't comment after every code run. It only reacts when:
- First run of the session
- Breakthrough (first success after 2+ failures)
- New error type (different from previous)
- Test pass count changed

**Tiered context assembly:**
Not every LLM call gets the full context. CANDIDATE_MESSAGE gets everything (~4500 tokens). CODE_RUN gets minimal context (~1500 tokens). PROACTIVE_GUIDANCE gets focused context (~2000 tokens). This saves 40-60% on non-chat calls.

**Priority queue:**
Events are processed in order: CANDIDATE_MESSAGE (3) > CODE_RUN (2) > PROACTIVE_GUIDANCE (1).

### Step 5: Candidate Runs Code

When the candidate clicks "Run" (or Ctrl+Enter), the code is:
1. Written to a temp directory
2. Executed in a Docker container with strict resource limits:
   - CPU: 0.5 cores
   - Memory: 256MB
   - Network: none (completely isolated)
   - PID limit: 50 (no fork bombs)
   - Timeout: 10-15 seconds
3. Output and errors are captured and returned
4. If a question is selected, public test cases are run in a single Docker container (all tests at once, not one container per test)
5. Results show pass/fail per test case with input/expected/actual

When the candidate clicks "Submit" (or Ctrl+Shift+Enter):
- ALL test cases run (public + hidden)
- Hidden test results show pass/fail count only (no details)
- Final results are computed and saved

### Step 6: Safety Guards

**Prompt Injection Protection:**
User messages are checked against 8 regex patterns before reaching the LLM. Blocked patterns include "ignore previous instructions," "write the full solution," "forget your rules." Blocked messages get a polite refusal and a 5-minute chat cooldown.

**Output Validation:**
Every LLM response is checked for code blocks (``` or 3+ indented lines) before being sent to the candidate. If code is detected, it's stripped and replaced with "Let me rephrase that as guidance instead."

**Progressive Rate Limiting:**
- Messages 1-15: no limit
- Messages 16-25: 30-second cooldown
- Messages 26+: 60-second cooldown
- After injection attempt: 5-minute cooldown

### Step 7: RL Feedback Loop

Every time the interviewer proactively speaks, the system starts a 3-minute observation window to measure whether the intervention helped.

| What Happened After | Reward | Meaning |
|---|---|---|
| Candidate progressed (new tests passing, lower churn) | +1 | Correct detection, helpful guidance |
| Candidate engaged in conversation, then progressed | +1 | Guidance led to learning |
| Candidate kept coding silently and was fine all along | -1 | False positive, shouldn't have interrupted |
| Candidate stayed stuck despite guidance | 0 | Correct detection, but guidance didn't land |
| Candidate asked for MORE help | +1 | Correct detection, needed even more |

These reward signals feed back into the heuristic weights over time, making the system better at knowing when to intervene.

### Step 8: Session Ends

When the timer expires, the candidate submits, or they close the tab:
1. All pending telemetry is flushed to MongoDB
2. The session is marked as completed
3. The LLM generates an interview summary in the interviewer's voice:

```json
{
  "summary": "John solved Two Sum using a hash map approach in 18 minutes. He struggled initially with the lookup logic. I asked him about O(1) lookup data structures, and he quickly connected it to hash maps. After that guidance, he solved it within 4 minutes.",
  "strengths": ["Good problem decomposition", "Efficient solution (O(n))", "Responded well to guidance"],
  "weaknesses": ["Initially tried brute force", "Missed edge case with negative numbers"],
  "rating": "Pass"
}
```

### Step 9: Analytics Dashboard

Interviewers can review all sessions at `/analytics`:
- Session list with candidate name, language, duration, test results, rating
- Click any session for detail view:
  - Interview summary (LLM-generated narrative)
  - Code replay (step-through playback of every keystroke)
  - Test results
  - Full conversation history with Cortex

### Session Recovery

If the candidate's browser crashes or they refresh the page:
- `localStorage` stores the active sessionId
- On page load, the client attempts to reconnect
- Server restores the session from in-memory state (or MongoDB fallback)
- Code, timer, chat history, and help level are all restored
- Cortex says "Welcome back! Let's continue where we left off."

---

## Tech Stack

| Layer | Technology |
|---|---|
| Server | Node.js 20+, Express, Socket.io |
| Frontend | React 18, TypeScript, Monaco Editor |
| Database | MongoDB Atlas (free tier) |
| LLM | Google Gemini Flash via @google/generative-ai |
| Code Sandbox | Docker (5 languages: Python, JS, Java, C, C++) |
| Deployment | Oracle Cloud Free Tier (ARM, 24GB RAM) |

---

## Project Structure

```
cortex/
  src/
    server/
      index.js                     Entry point (Express + Socket.io)
      config/
        defaults.js                Heuristic weights, thresholds, language configs
        questions.json             Question bank (seeded with Two Sum)
      db/
        connection.js              MongoDB Atlas connection with retry
        models/
          Session.js               Session schema (events, lineHistory, submissions)
          Snapshot.js              30s analysis snapshots
          ChatLog.js               Every LLM conversation turn
          RLFeedback.js            Intervention outcome tracking
      routes/
        execution.js               /api/run, /api/check, /api/submit
        questions.js               /api/questions
        sessions.js                /api/sessions, /api/session/:id
      services/
        sessionManager.js          In-memory session state + write buffer
        heuristicEngine.js         Tier 1: Stuck Index calculator (7 signals)
        slmGateway.js              Tier 2: Conditional Gemini classification
        interviewerBrain.js        Tier 3: LLM interviewer (priority queue + prompts)
        promptGuard.js             Input sanitization + output validation + rate limiter
        codeRunner.js              Docker sandbox execution
        testCaseRunner.js          Template wrapping + single-container test runner
        timerService.js            Per-session countdown
        snapshotLoop.js            30s server-side analysis loop
        writeBufferFlusher.js      Batched MongoDB writes (every 5s)
        rlFeedbackLogger.js        Observation windows + reward signals
        summaryGenerator.js        Post-session LLM evaluation
      socket/
        handler.js                 WebSocket event handlers
      utils/
        gemini.js                  Gemini API wrapper with fallback
    client/
      src/
        App.tsx                    Root routing
        socket.ts                  Socket.io client
        api.ts                     REST API client
        types.ts                   TypeScript interfaces
        views/
          EntryPage.tsx            Pre-interview name/email screen
          InterviewPage.tsx        3-pane interview layout
          AnalyticsListPage.tsx    Session list
          AnalyticsDetailPage.tsx  Session detail + replay
        components/
          CodeEditor.tsx           Monaco editor (all autocomplete disabled)
          OutputPanel.tsx          Run output + test results
          QuestionPanel.tsx        Problem display
          InterviewerPanel.tsx     Chat with Cortex
          TimerBar.tsx             Countdown with urgency states
        hooks/
          useTelemetry.ts          Keystroke capture + batching
          useKeyboardShortcuts.ts  Ctrl+Enter, Ctrl+Shift+Enter
          useTabVisibility.ts      Tab focus/blur tracking
          useSessionRecovery.ts    localStorage session persistence
  docker/
    python/Dockerfile
    node/Dockerfile
    java/Dockerfile
    c/Dockerfile
    cpp/Dockerfile
  tests/
    server/
      services/                   Unit tests for all services
      routes/                     Integration tests for all routes
  docs/
    specs/                         Design specification
    superpowers/plans/             Implementation plans
```

---

## Setup

### Prerequisites

- Node.js v20+
- Docker
- MongoDB Atlas account (free tier)
- Google Gemini API key (free tier)

### 1. Clone and Install

```bash
git clone <repo-url>
cd cortex

# Install server dependencies
npm install

# Install client dependencies
cd src/client && npm install && cd ../..
```

### 2. Environment Variables

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your_gemini_api_key_here
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/cortex?retryWrites=true&w=majority
PORT=3000
NODE_ENV=development
SESSION_TIME_LIMIT_MS=2700000
```

### 3. Build Docker Images

```bash
./build-images.sh
```

This builds sandbox images for Python, JavaScript, Java, C, and C++.

### 4. Run

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Start React dev server
cd src/client && npm start
```

Open `http://localhost:3001` in your browser.

### 5. Run Tests

```bash
npm test
```

51 tests across 10 suites.

---

## API Reference

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| POST | /api/run | Run code in Docker sandbox |
| POST | /api/check | Syntax-only compilation check |
| POST | /api/submit | Submit solution (all tests) |
| GET | /api/questions | List all questions |
| GET | /api/questions/:id | Get question by ID |
| GET | /api/sessions | List all sessions |
| GET | /api/session/:id | Get full session data |
| GET | /api/session/:id/chat | Get chat history |
| GET | /api/health | Health check |

### WebSocket Events

**Client to Server:**

| Event | Description |
|---|---|
| start-session | Create new interview session |
| telemetry | Batched keystroke/metric data |
| telemetry-meta | Tab visibility changes |
| chat-message | Candidate talks to interviewer |
| run-code | Notify of code run (for commentary) |
| submit-code | Submit solution |
| reconnect-session | Restore session after refresh |

**Server to Client:**

| Event | Description |
|---|---|
| session-created | Session initialized, interview begins |
| interviewer-message | Cortex speaks |
| run-result | Code execution results |
| submit-result | Submission results |
| timer-sync | Timer update (every 10s) |
| session-timeout | Time limit reached |
| session-restored | Session hydrated after reconnect |
| session-ended | Interview complete with summary |

---

## Database Collections

| Collection | Purpose |
|---|---|
| sessions | All telemetry, code, submissions, test results per interview |
| snapshots | 30s analysis snapshots (code + metrics + SLM results) |
| chat_logs | Every LLM conversation turn (prompt + response) |
| rl_feedback | Intervention outcomes for weight tuning |

---

## Deployment (Oracle Cloud Free Tier)

The entire platform runs on a single Oracle Cloud ARM VM (4 cores, 24GB RAM, free forever):

1. Node.js server (PM2)
2. Docker engine (sandbox containers)
3. Nginx (reverse proxy + SSL via Let's Encrypt)

MongoDB runs on Atlas (cloud), not on the VM.

---

## License

MIT
