# Cortex - High Level Design (HLD)

## 1. System Overview

Cortex is an AI-powered coding interview platform where the AI acts as the interviewer. It replicates a human interviewer's ability to recognize when a candidate is struggling, offer timely contextual guidance, and evaluate performance -- all without human intervention.

```
                    CANDIDATE'S BROWSER
    +-----------------------------------------------------+
    |  Entry Page --> Interview Page --> Results            |
    |  [Question]  [Monaco Editor]  [Interviewer Chat]     |
    |                    |                                  |
    |              [Timer Bar]                              |
    +-----------------------------------------------------+
                         |
                    Socket.io (WebSocket)
                         |
    +-----------------------------------------------------+
    |              NODE.JS SERVER                          |
    |                                                      |
    |  +------------+  +------------+  +--------------+    |
    |  | Session    |  | Heuristic  |  | Interviewer  |    |
    |  | Manager    |  | Engine     |  | Brain (LLM)  |    |
    |  +------+-----+  +------+-----+  +------+-------+    |
    |         |               |               |            |
    |  +------+-----+  +------+-----+  +------+-------+    |
    |  | Write      |  | SLM        |  | Prompt       |    |
    |  | Buffer     |  | Gateway    |  | Guard        |    |
    |  +------+-----+  +------+-----+  +--------------+    |
    |         |               |                            |
    |  +------+-----+  +------+-----+  +--------------+    |
    |  | Code       |  | Snapshot   |  | RL Feedback   |    |
    |  | Runner     |  | Loop       |  | Logger        |    |
    |  +------+-----+  +------+-----+  +------+-------+    |
    |         |               |               |            |
    +-----------------------------------------------------+
              |               |               |
    +---------+--+    +-------+--+    +-------+------+
    | Docker     |    | MongoDB  |    | Gemini API   |
    | Engine     |    | Atlas    |    | (Flash)      |
    +------------+    +----------+    +--------------+
```

## 2. Core Architectural Principles

### 2.1 Single Process Architecture
Everything runs in one Node.js process. No microservices, no message brokers, no Redis. Session state lives in-memory. Background services (snapshot loop, write buffer) use `setInterval`. This keeps deployment simple and free (single VM).

### 2.2 Cost-Tiered Detection Pipeline
LLM calls are expensive. The system uses a 2-tier detection pipeline to minimize them:

```
Every 30 seconds:
  Tier 1: Heuristic Engine (pure math, 0 cost, <5ms)
    |
    S < (T - 15): Do nothing. Just save metrics to MongoDB.
    S >= (T - 15): Warm zone --> call Tier 2
    S >= T: Threshold breach --> call Tier 2
    |
  Tier 2: SLM Gateway (Gemini Flash call, ~2s)
    |
    should_call_llm = false: Log and wait.
    should_call_llm = true: Trigger interviewer guidance (Tier 3)
    |
  Tier 3: Interviewer Brain (Gemini Flash call, ~2s)
    Generates natural interviewer response.
```

A typical 45-minute session makes 5-10 SLM calls total. Without the heuristic gate, it would be 90.

### 2.3 In-Memory First, Persist Second
Telemetry arrives every 350ms. Writing to MongoDB on every batch would create 170+ writes/minute. Instead:
- **Layer 1**: WebSocket data is applied instantly to in-memory session state (the heuristic engine reads from here)
- **Layer 2**: A write buffer flushes accumulated events to MongoDB every 5 seconds using batched `$push` operations

### 2.4 The Interviewer Abstraction
The candidate never sees "hint system" or "detection pipeline." They see an interviewer named Cortex who naturally asks questions, comments on code runs, and offers guidance. The system prompt enforces this persona.

## 3. Component Responsibilities

### 3.1 Frontend (React + TypeScript)
- **EntryPage**: Candidate identification (name, email, language)
- **InterviewPage**: 3-pane resizable layout with question, editor, and interviewer chat
- **Telemetry hooks**: Capture keystrokes, compute line metrics, detect pastes, batch and stream
- **Timer**: Visual countdown with urgency states (normal/caution/urgent)
- **Analytics**: Session list, detail view with code replay and chat history

### 3.2 Session Manager
- Creates and manages in-memory session state
- Tracks current code, line history, metrics, submissions, failure streaks
- Maintains per-session write buffers for batched MongoDB persistence
- Source of truth for all real-time data (heuristic engine reads from here)

### 3.3 Heuristic Engine
- Pure math module, no API calls, runs every 30 seconds
- Computes Stuck Index (S) from 7 weighted signals
- Enforces 90-second grace period and 60-second cooldown between escalations
- Differentiates "thinking" (long idle + confident burst) from "stuck" (high churn + undos + failures)
- Derives help_level (0-3) from struggle score

### 3.4 SLM Gateway
- Lightweight Gemini Flash classification call
- Only invoked when heuristic says it's worth checking
- Receives condensed state log, returns binary stuck/not-stuck with reasoning
- Falls back gracefully when API is unavailable (uses heuristic confidence)
- Saves every call as a Snapshot document in MongoDB

### 3.5 Interviewer Brain
- Priority queue: CANDIDATE_MESSAGE (3) > CODE_RUN (2) > PROACTIVE_GUIDANCE (1)
- Tiered context: full context for chat (~4500 tokens), minimal for code run (~1500), focused for proactive (~2000)
- Uses hint_templates from question JSON as base, personalizes with LLM
- Output validation strips code blocks before sending to candidate
- Falls back to raw hint templates when Gemini API is unavailable

### 3.6 Code Execution Engine
- Docker sandbox with strict isolation (no network, limited CPU/memory/PIDs)
- Supports 5 languages: Python, JavaScript, Java, C, C++
- Test case runner wraps candidate code with harness, runs ALL tests in single container
- Syntax checking via compile-only Docker runs

### 3.7 Prompt Guard
- Input: 8 regex patterns block injection attempts (e.g., "ignore previous instructions")
- Output: Code block detection strips leaked code from LLM responses
- Rate limiter: Progressive cooldown (free < 15, 30s cooldown 15-25, 60s cooldown 25+)

### 3.8 RL Feedback Logger
- Logs every proactive intervention with a 3-minute observation window
- Measures whether guidance led to candidate progress
- Assigns reward signals (+1, 0, -1) that feed back into heuristic weight tuning
- Data stored in `rl_feedback` collection for periodic analysis

### 3.9 Summary Generator
- One final LLM call when the session ends
- Receives: final code, test results, struggle trajectory, intervention history
- Produces: narrative summary, strengths, weaknesses, rating (Strong Pass/Pass/Borderline/Fail)
- Written in first person as the interviewer's evaluation notes

## 4. Data Flow

```
Keystroke --> Client Telemetry --> WebSocket --> Session Manager (in-memory)
                                                     |
                                          +----------+----------+
                                          |                     |
                                    Write Buffer           Heuristic Engine
                                    (flush 5s)              (every 30s)
                                          |                     |
                                          v                S >= T-15?
                                     MongoDB Atlas          |      |
                                                          No     Yes
                                                          |       |
                                                        (wait)  SLM Gateway
                                                                  |
                                                            stuck confirmed?
                                                             |        |
                                                           No        Yes
                                                           |          |
                                                         (log)   Interviewer Brain
                                                                      |
                                                                  LLM generates
                                                                  response
                                                                      |
                                                                 WebSocket push
                                                                      |
                                                                 Candidate sees
                                                                 natural message
```

## 5. External Dependencies

| Dependency | Purpose | Free Tier Limits |
|---|---|---|
| MongoDB Atlas | Persistent storage | 512MB, shared cluster |
| Google Gemini Flash | LLM for SLM + interviewer + summary | 15 RPM |
| Docker Engine | Code sandbox isolation | Local, no limits |
| Oracle Cloud ARM VM | Hosting | 4 cores, 24GB RAM, forever free |

## 6. Deployment Architecture

```
Oracle Cloud ARM VM (24GB RAM, 4 OCPU)
+------------------------------------------+
|                                          |
|  Nginx (port 80/443, SSL)               |
|    |                                     |
|    +-> Node.js (port 3000)              |
|    |     |                               |
|    |     +-> Express REST API           |
|    |     +-> Socket.io WebSocket        |
|    |     +-> Static React files         |
|    |     +-> Background services        |
|    |           - Snapshot loop (30s)     |
|    |           - Write buffer (5s)      |
|    |           - Timer sync (10s)       |
|    |                                     |
|    +-> Docker Engine                    |
|          Ephemeral sandbox containers    |
|                                          |
+------------------------------------------+
           |
           | HTTPS
           v
    MongoDB Atlas (cloud)
    Gemini API (cloud)
```

## 7. Scalability Considerations

Current design is single-server, supporting ~10-20 concurrent interviews. To scale beyond that:

| Bottleneck | Solution |
|---|---|
| In-memory sessions | Add Redis for shared state across multiple Node processes |
| WebSocket connections | Use Socket.io Redis adapter for multi-process |
| Docker containers | Container pool with pre-warming (already partially implemented) |
| MongoDB writes | Already optimized via write buffering |
| Gemini API calls | Already optimized via heuristic gating (5-10 calls per session) |

## 8. Security Model

| Threat | Mitigation |
|---|---|
| Code execution escape | Docker: no network, 256MB RAM, 0.5 CPU, 50 PID limit, 10-15s timeout |
| Prompt injection | 8 regex patterns + 5-minute cooldown on detection |
| LLM leaking answers | Output validation strips code blocks before delivery |
| Rate abuse | Progressive rate limiter (3 tiers) |
| Session hijacking | UUID session IDs, no auth (by design -- link-based access) |
| Data at rest | MongoDB Atlas encryption (managed) |
