# Cortex - Low Level Design (LLD)

## 1. Database Schema

### 1.1 MongoDB Database: `cortex`

All data lives in a single database on MongoDB Atlas. Four collections.

### 1.2 Collection: `sessions`

One document per interview. Stores everything about the session: telemetry, code history, submissions, test results, and the final evaluation.

```javascript
{
  sessionId:    String,       // UUID, unique index
  language:     String,       // "python" | "javascript" | "java" | "c" | "cpp"
  initialCode:  String,       // Function skeleton from canonical_skeleton
  startTime:    Number,       // Unix timestamp (ms)
  endTime:      Number,       // Set on stop/submit/timeout
  timeLimit:    Number,       // Max duration in ms
  difficulty:   String,       // "easy" | "medium" | "hard"
  questionId:   String,       // References questions.json
  status:       String,       // "active" | "submitted" | "timeout" | "abandoned"

  candidate: {
    name:       String,
    email:      String
  },

  // Raw keystroke events (used for replay)
  events: [{
    timestamp:  Number,       // Relative to startTime
    type:       String,       // "EDIT" | "PASTE"
    payload:    Mixed         // { changes: [{range, text, rangeLength}] }
  }],

  // Per-line content versioning + behavioral metrics
  lineHistory: {
    "<lineNumber>": [{
      timestamp: Number,
      content:   String,      // Full line text at this version
      metrics: {              // Present on LINE_METRICS events
        activeMs:      Number,  // Time actively editing this line
        idleMs:        Number,  // Time idle on this line
        delayMs:       Number,  // Pause before typing resumed
        delayOutlier:  Boolean, // Abnormally long pause?
        churnRatio:    Number,  // Keystrokes / final chars (1.0 = perfect)
        churnAdded:    Number,  // Total chars typed
        churnDeleted:  Number,  // Total chars deleted
        undoCount:     Number,  // Ctrl+Z count
        redoCount:     Number,  // Ctrl+Y count
        keystrokeRate: Number,  // Chars per second
        idleFlag:      Boolean  // Idle > 3 seconds?
      }
    }]
  },

  // Tab visibility tracking
  tabEvents: [{
    timestamp:  Number,
    type:       String,       // "TAB_AWAY" | "TAB_RETURN"
    durationMs: Number        // How long away (set on TAB_RETURN)
  }],

  // Every code run and submission
  all_submissions: [{
    code:        String,
    output:      String,
    error:       String,
    testResults: [{
      testId:        String,  // "public-0", "hidden-2"
      passed:        Boolean,
      input:         Mixed,
      expected:      Mixed,
      actual:        Mixed,   // null for hidden tests
      executionTime: Number   // ms
    }],
    isSubmission: Boolean,    // true = Submit, false = Run
    timestamp:    Number
  }],

  // Set on submission
  finalResults: {
    publicPassed:  Number,
    publicTotal:   Number,
    hiddenPassed:  Number,
    hiddenTotal:   Number,
    allPassed:     Boolean
  },

  // LLM-generated post-session evaluation
  interviewSummary: {
    summary:     String,      // Narrative in interviewer's voice
    strengths:   [String],
    weaknesses:  [String],
    rating:      String,      // "Strong Pass" | "Pass" | "Borderline" | "Fail"
    generatedAt: Date
  },

  meta: Mixed                 // { userAgent, socketId, ... }
}
```

### 1.3 Collection: `snapshots`

One document per 30-second analysis cycle. Records the code state, computed metrics, and SLM analysis results.

```javascript
{
  sessionId:      String,     // Index
  code:           String,     // Code at snapshot time
  metrics: {
    progressiveSeconds: Number,  // 30, 60, 90, ...
    stuckIndex:         Number,  // Computed S value
    threshold:          Number,  // T for this difficulty
    avgChurnRatio:      Number,
    failureStreak:      Number,
    pasteCount:         Number,
    tabAwayCount:       Number,
    tabAwayTotalMs:     Number,
    idlePercent:        Number,
    undoFrequency:      Number,
    keystrokeRateDrop:  Number,
    sameLineOscillation: Number,
    delayOutlierFreq:   Number
  },
  prompt:          String,    // SLM prompt (null if no SLM call)
  systemPrompt:    String,    // SLM system prompt
  response:        String,    // Raw SLM response
  shouldCallLlm:   Boolean,   // Parsed result (index)
  reasoning:       String,    // SLM's analysis
  fallbackUsed:    Boolean,   // true if Gemini API failed
  createdAt:       Date
}
```

### 1.4 Collection: `chat_logs`

One document per LLM invocation. Captures the full prompt, response, and session state at that moment.

```javascript
{
  sessionId:      String,     // Index
  trigger:        String,     // "CANDIDATE_MESSAGE" | "CODE_RUN" | "PROACTIVE_GUIDANCE"
  priority:       Number,     // 3, 2, or 1
  prompt:         String,     // Full assembled prompt
  rawResponse:    String,     // Raw LLM response
  extractedJson: {
    output_chat:  String      // Cleaned text sent to candidate
  },
  helpLevel:      Number,     // 0-3, at time of call
  struggleScore:  Number,     // 0-100, at time of call
  userMessage:    String,     // Candidate's message (null for system triggers)
  codeSnapshot:   String,     // Code at time of call
  codeBlockDetected: Boolean, // true if output validation caught leaked code
  fallbackUsed:   Boolean,    // true if Gemini failed, template used instead
  createdAt:      Date
}
```

### 1.5 Collection: `rl_feedback`

One document per proactive interviewer intervention. Tracks whether the intervention helped.

```javascript
{
  sessionId:          String,    // Index
  stuckIndex:         Number,    // S when intervention triggered
  slmShouldCallLlm:  Boolean,
  interviewerMessage: String,    // What Cortex said
  helpLevel:          Number,    // 0-3
  candidateResponse:  String,    // "engaged" | "silent_progressed" | "silent_stuck" | "asked_more_help"
  observationWindowMs: Number,   // 180000 (3 min)
  postOutcome:        String,    // "progressed" | "still_stuck"
  reward:             Number,    // +1, 0, or -1
  weightsAtTime:      [Number],  // [w1, w2, w3, w4, w5, w6, w7]
  thresholdAtTime:    Number,    // T at time of intervention
  problemDifficulty:  String,
  problemId:          String,
  createdAt:          Date,
  resolvedAt:         Date       // When outcome was determined
}
```

---

## 2. In-Memory Session State

Each active session has an in-memory state object managed by `sessionManager.js`. This is the source of truth during the interview -- MongoDB is eventual persistence.

```javascript
{
  sessionId:        String,
  language:         String,
  initialCode:      String,
  currentCode:      String,          // Updated on every LINE_UPDATE
  startTime:        Number,
  endTime:          Number | null,
  timeLimit:        Number,
  difficulty:       String,
  questionId:       String,
  status:           String,          // "active" | "submitted" | "timeout" | "abandoned"
  candidate:        { name, email },

  // Telemetry accumulation
  pendingEvents:    Array,           // EDIT/PASTE events waiting for MongoDB flush
  lineHistory:      Map<Number, Array>,  // Per-line versioning with metrics
  tabEvents:        Array,
  submissions:      Array,           // Code run results

  // Heuristic signals
  failureStreak:    Number,          // Consecutive failed runs
  lastRunError:     String | null,
  lastRunTestResults: Array | null,
  pasteCount:       Number,
  tabAwayCount:     Number,
  tabAwayTotalMs:   Number,
  lastTabAwayTs:    Number | null,

  // Detection state
  snapshotCount:    Number,          // How many 30s snapshots taken
  helpLevel:        Number,          // 0-3, derived from stuckIndex
  struggleScore:    Number,          // 0-100, equals stuckIndex

  // Chat state
  messageCount:     Number,
  lastMessageTs:    Number | null,
  injectionCooldownUntil: Number | null,

  // Internal flags
  _pendingProactiveGuidance: Boolean  // Set by snapshot loop, consumed by socket handler
}
```

### Write Buffer (separate Map)

```javascript
Map<sessionId, {
  events:      Array,  // EDIT/PASTE events
  lineUpdates: Array,  // LINE_UPDATE events
  lineMetrics: Array,  // LINE_METRICS events
  tabEvents:   Array   // TAB_AWAY/TAB_RETURN events
}>
```

Flushed to MongoDB every 5 seconds via `writeBufferFlusher.js`.

---

## 3. Heuristic Engine Internals

### 3.1 Input Signals (7 signals, all normalized to 0-100)

| # | Signal | Raw Source | Normalization | Weight |
|---|---|---|---|---|
| w1 | Idle time | idleMs / (activeMs + idleMs) as percentage | (idlePercent / 50) * 100 | 0.15 |
| w2 | Churn ratio | Average churnRatio across all line metrics | (avgChurn / 3) * 100 | 0.25 |
| w3 | Failure streak | Consecutive failed code runs | (streak / 5) * 100 | 0.20 |
| w4 | Delay outlier frequency | Fraction of line metrics with delayOutlier=true | (freq / 0.5) * 100 | 0.10 |
| w5 | Undo frequency | Total undoCount across all lines | (undos / 10) * 100 | 0.10 |
| w6 | Keystroke rate drop | % drop in recent keystroke rate vs baseline | Already 0-100 | 0.10 |
| w7 | Same-line oscillation | Lines edited more than 3 times | (count / 5) * 100 | 0.10 |

### 3.2 Stuck Index Formula

```
S = sum(w[i] * normalized[i]) for i in 0..6
```

S is on a 0-100 scale. All normalized values are capped at 100.

### 3.3 Threshold Logic

```
T = { easy: 70, medium: 55, hard: 40 }

if sessionAge < 90s:          return grace_period (S=0)
if S >= T and not in cooldown: shouldEscalate = true
if S >= T-15 and S < T:       inWarmZone = true (call SLM for confirmation)
```

### 3.4 Help Level Derivation

```
S < 25   --> helpLevel = 0 (no guidance)
25 <= S < 50 --> helpLevel = 1 (nudge)
50 <= S < 75 --> helpLevel = 2 (guide)
S >= 75  --> helpLevel = 3 (direction)
```

---

## 4. Test Case Runner Internals

### 4.1 Template Wrapping

Each question has a `test_harness` per language. The candidate's code is prepended, and the harness is appended:

```python
# --- Candidate's code ---
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        c = target - n
        if c in seen: return [seen[c], i]
        seen[n] = i
    return []

# --- Auto-generated harness (from questions.json) ---
import json, sys
_tests = json.loads(sys.stdin.read())
_results = []
for _t in _tests:
    try:
        import time as _time; _s = _time.time()
        _out = two_sum(_t['nums'], _t['target'])
        _results.append({'output': _out, 'error': None, 'time_ms': round((_time.time() - _s) * 1000)})
    except Exception as _e:
        _results.append({'output': None, 'error': str(_e), 'time_ms': 0})
print(json.dumps(_results))
```

### 4.2 Single-Container Execution

All test inputs are JSON-stringified and piped via stdin. One Docker container runs all tests sequentially. Output is a JSON array of results. Server parses and compares each output against expected (order-insensitive for arrays).

### 4.3 Output Comparison

```javascript
compareOutput(actual, expected):
  Arrays:     sort both, compare element-wise
  Objects:    JSON.stringify compare
  Primitives: strict equality (===)
  null/undef: identity check
```

---

## 5. Interviewer Brain Internals

### 5.1 Priority Queue

Per-session, in-memory array sorted by priority descending:
- CANDIDATE_MESSAGE: priority 3 (always processed first)
- CODE_RUN: priority 2
- PROACTIVE_GUIDANCE: priority 1

### 5.2 Tiered Context Assembly

**CANDIDATE_MESSAGE (~4500 tokens):**
Guidance level + struggle score + question text + hint templates + code + recent runs (last 3) + line history (last 20 lines) + timer context + candidate's message

**CODE_RUN (~1500 tokens):**
Guidance level + code + this run's output/error + previous run's output/error + test results summary + timer

**PROACTIVE_GUIDANCE (~2000 tokens):**
Guidance level + struggle score + hint templates + code + struggle indicators (failure streak, paste count, tab-away count) + timer

### 5.3 Response Extraction

LLM is instructed to output `{"output_chat": "text"}`. Parser tries:
1. Direct `JSON.parse(response)`
2. Regex for JSON object containing `output_chat` key
3. Falls back to raw response text if no JSON found

### 5.4 Output Validation Pipeline

```
LLM response
    |
    v
extractOutputChat() --> clean text
    |
    v
validateOutput() --> check for code blocks (``` or 3+ indented lines)
    |
    +-- safe: send to candidate
    +-- unsafe: strip code blocks, append disclaimer, log incident
```

### 5.5 Smart CODE_RUN Filtering

Not every code run triggers interviewer commentary. The socket handler checks:

```
Enqueue if:
  - First run ever (isFirstRun)
  - New error type (error !== prevError)
  - Breakthrough (success after failureStreak >= 2)
  - Test pass count changed

Skip if:
  - Same error as before
  - Same test results
  - Success after success (they're iterating fine)
```

---

## 6. Socket.io Event Flow

### 6.1 Session Start

```
Client: emit('start-session', {candidateName, candidateEmail, language, questionId})
  |
Server:
  1. Find question in questions.json (or use first)
  2. Get canonical_skeleton for language --> initialCode
  3. createSession() in sessionManager
  4. Session.create() in MongoDB
  5. socket.join(sessionId)
  6. createTimer(sessionId, startTime, timeLimit, onTimeout)
  7. Start 10s timer sync interval
  8. emit('session-created', {sessionId, question, initialCode, timeLimit, startTime})
```

### 6.2 Telemetry Flow

```
Client: emit('telemetry', {sessionId, edits, lineUpdates, lineMetrics, pasteEvents})
  |
Server:
  1. applyTelemetry() --> update in-memory state
  2. Events accumulate in write buffer
  3. Write buffer flushes to MongoDB every 5s
  4. Heuristic engine reads from in-memory state every 30s
```

### 6.3 Chat Flow

```
Client: emit('chat-message', {sessionId, text})
  |
Server:
  1. checkRateLimit() --> reject if throttled
  2. sanitizeInput() --> reject if injection
  3. Increment messageCount, update lastMessageTs
  4. enqueueEvent(CANDIDATE_MESSAGE, priority: 3)
  5. processQueue() --> build prompt --> callGemini() --> extractOutputChat()
  6. validateOutput() --> strip code if leaked
  7. ChatLog.create() in MongoDB
  8. emit('interviewer-message', {text, trigger})
```

### 6.4 Proactive Guidance Flow

```
Snapshot Loop (every 30s):
  1. computeStuckIndex() --> S, threshold T
  2. if S >= T or warm zone:
     evaluateWithSLM() --> {shouldCallLlm, reasoning}
  3. if shouldCallLlm and no active observation:
     markEscalation()
     state._pendingProactiveGuidance = true
  |
  (Next chat-message or run-code handler picks this up,
   or a dedicated check fires)
  |
  enqueueEvent(PROACTIVE_GUIDANCE, priority: 1)
  processQueue() --> build prompt with hint templates --> callGemini()
  emit('interviewer-message', {text, trigger: 'PROACTIVE_GUIDANCE'})
  logInterventionStart() --> start 3-min observation window
```

---

## 7. Question JSON Schema

```javascript
{
  "id":                String,     // Unique identifier
  "title":             String,     // Display name
  "Full_question":     String,     // Complete problem statement
  "short_description": String,     // One-liner
  "difficulty":        { numeric: Number, label: String },
  "concepts":          [String],   // Tags like "array", "hashing"

  "canonical_skeleton": {          // Pre-populated editor code per language
    "python":     String,
    "javascript": String,
    "java":       String,
    "c":          String,
    "cpp":        String
  },

  "function_name": {               // Expected function name per language
    "python":     String,
    "javascript": String,
    // ...
  },

  "test_harness": {                // Test runner code per language
    "python":     String,          // Reads stdin JSON, calls function, prints JSON
    "javascript": String,
    // ...
  },

  "public_tests": [{              // Visible to candidate
    "input":       Mixed,
    "output":      Mixed,
    "explanation": String | null
  }],

  "hidden_tests": [{              // Only on Submit, pass/fail count only
    "input":  Mixed,
    "output": Mixed
  }],

  "hint_templates": [{            // Base for LLM-generated guidance
    "nudge":     String,          // Level 1: probing question
    "guide":     String,          // Level 2: approach explanation
    "direction": String           // Level 3: step-by-step walkthrough
  }],

  "constraints":   { time_ms, memory_mb },
  "edge_cases":    [String]
}
```

---

## 8. Docker Sandbox Configuration

### 8.1 Per-Language Config

| Language | Image | Filename | Timeout | Run Command | Check Command |
|---|---|---|---|---|---|
| Python | python:3.9-custom | main.py | 10s | python3 /work/main.py | python3 -m py_compile /work/main.py |
| JavaScript | node:18-custom | main.js | 10s | node /work/main.js | node --check /work/main.js |
| Java | eclipse-temurin:11-custom | Main.java | 15s | cd /work && javac Main.java && java Main | cd /work && javac Main.java |
| C | gcc:latest-custom | main.c | 15s | cd /work && gcc main.c -o main && ./main | cd /work && gcc -fsyntax-only main.c |
| C++ | gcc:latest-custom | main.cpp | 15s | cd /work && g++ main.cpp -o main && ./main | cd /work && g++ -fsyntax-only main.cpp |

### 8.2 Security Flags

```
--rm                    Remove container after execution
--cpus=0.5             Limit to half a CPU core
--memory=256m          Limit to 256MB RAM
--network=none         No network access (completely isolated)
--pids-limit=50        No fork bombs
```

### 8.3 Execution Flow

```
1. Generate UUID for tmp directory
2. Write candidate code to tmp/<uuid>/<filename>
3. Build docker command: docker run <flags> -v "tmp/<uuid>:/work" <image> sh -c "<cmd>"
4. Execute via child_process.exec with timeout
5. Capture stdout + stderr
6. Cleanup tmp/<uuid>
7. Parse and return result
```

---

## 9. Environment Variables

```
# Required
GEMINI_API_KEY              Google Gemini API key

# Required
MONGO_URI                   MongoDB Atlas connection string

# Optional (defaults)
PORT=3000                   Server port
NODE_ENV=development        Environment
SESSION_TIME_LIMIT_MS=2700000   Default interview duration (45 min)
OBSERVATION_WINDOW_MS=180000    RL observation window (3 min)
```

Heuristic weights, thresholds, grace period, and cooldown are configured in `src/server/config/defaults.js` (not environment variables, since they're tuned by the RL feedback loop).

---

## 10. Error Handling Strategy

| Scenario | Handling |
|---|---|
| MongoDB connection failure | Retry 5 times with 5s delay, then crash |
| MongoDB write failure | Log error, continue (in-memory state is source of truth) |
| Gemini API failure (SLM) | If S > T+15: proceed without SLM. Else: skip this cycle. |
| Gemini API failure (chat) | Respond: "Sorry, I missed that -- could you say that again?" |
| Gemini API failure (proactive) | Fall back to raw hint_template text |
| Gemini API failure (summary) | Generate data-only summary from raw metrics |
| Docker timeout | Return "Execution timed out" error |
| Docker crash | Return error message, cleanup tmp dir |
| WebSocket disconnect | Session stays in memory, candidate can reconnect |
| Prompt injection detected | Polite refusal + 5-minute cooldown |
| LLM leaks code | Strip code blocks, append disclaimer |
| Rate limit exceeded | Return cooldown message |
