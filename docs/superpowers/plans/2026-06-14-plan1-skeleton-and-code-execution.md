# Plan 1: Project Skeleton + Code Execution Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the Cortex monorepo with a working Express + Socket.io server, Mongoose connection to Atlas, Docker-based code execution sandbox, and test case runner -- the foundation everything else builds on.

**Architecture:** Single Node.js Express server with Socket.io. Mongoose connects to MongoDB Atlas via connection string. Code execution runs candidate code in isolated Docker containers with CPU/memory/network limits. Test case runner wraps candidate code with a harness and runs all tests in a single container.

**Tech Stack:** Node.js 20+, Express, Socket.io, Mongoose, Docker, `uuid`, `dotenv`

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Root monorepo config, scripts, server dependencies |
| `.env.example` | Template for environment variables |
| `.gitignore` | Ignore node_modules, .env, tmp, build |
| `src/server/index.js` | Entry point: Express + Socket.io + static serving + health check |
| `src/server/config/defaults.js` | Language configs, Docker flags, timeouts, default thresholds |
| `src/server/config/questions.json` | Question bank (seeded with Two Sum) |
| `src/server/db/connection.js` | Mongoose connection with retry logic |
| `src/server/db/models/Session.js` | Session schema (events, lineHistory, submissions, etc.) |
| `src/server/services/codeRunner.js` | Execute code in Docker sandbox, capture output |
| `src/server/services/testCaseRunner.js` | Template wrapping, run all tests in single container, compare results |
| `src/server/routes/execution.js` | POST /api/run, POST /api/check, POST /api/submit |
| `src/server/routes/questions.js` | GET /api/questions, GET /api/questions/:id |
| `docker/python/Dockerfile` | Python 3.9 sandbox image |
| `docker/node/Dockerfile` | Node 18 sandbox image |
| `docker/java/Dockerfile` | OpenJDK 11 sandbox image |
| `docker/c/Dockerfile` | GCC sandbox image (C) |
| `docker/cpp/Dockerfile` | GCC sandbox image (C++) |
| `build-images.sh` | Script to build all Docker images |
| `tests/server/services/codeRunner.test.js` | Unit tests for code runner |
| `tests/server/services/testCaseRunner.test.js` | Unit tests for test case runner |
| `tests/server/routes/execution.test.js` | Integration tests for /api/run, /api/check, /api/submit |
| `tests/server/routes/questions.test.js` | Integration tests for questions API |

---

### Task 1: Initialize Project and Package Config

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cortex",
  "version": "1.0.0",
  "description": "AI-Assisted Coding Interview Platform",
  "type": "module",
  "main": "src/server/index.js",
  "scripts": {
    "start": "node src/server/index.js",
    "dev": "node --watch src/server/index.js",
    "test": "node --experimental-vm-modules node_modules/.bin/jest --forceExit",
    "build:client": "cd src/client && npm run build",
    "build:docker": "./build-images.sh"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.0",
    "mongoose": "^8.8.0",
    "socket.io": "^4.8.0",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "@jest/globals": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "keywords": ["interview", "coding", "ai"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create .env.example**

```
# Required
GEMINI_API_KEY=your_gemini_api_key_here

# Required: MongoDB Atlas connection string
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/cortex?retryWrites=true&w=majority

# Optional (defaults shown)
PORT=3000
NODE_ENV=development
SESSION_TIME_LIMIT_MS=2700000
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
tmp/
build/
dist/
src/client/build/
*.log
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: initialize cortex project with dependencies"
```

---

### Task 2: Server Entry Point (Express + Socket.io)

**Files:**
- Create: `src/server/index.js`

- [ ] **Step 1: Create the entry point**

```javascript
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/socket.io/')) {
      res.sendFile(path.join(clientBuild, 'index.html'));
    }
  });
}

// Socket.io placeholder
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  httpServer.listen(PORT, () => {
    console.log(`Cortex server running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export { app, io, httpServer };
```

- [ ] **Step 2: Verify it starts (will fail on connectDB -- that's expected)**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && node src/server/index.js`
Expected: Error about `./db/connection.js` not found. That's correct -- we build it next.

- [ ] **Step 3: Commit**

```bash
git add src/server/index.js
git commit -m "feat: add express + socket.io server entry point"
```

---

### Task 3: MongoDB Connection

**Files:**
- Create: `src/server/db/connection.js`

- [ ] **Step 1: Create connection module with retry logic**

```javascript
import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cortex';
let isConnected = false;

export async function connectDB() {
  if (isConnected) return;

  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 10000,
      });
      isConnected = true;
      console.log('MongoDB connected');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw new Error('Failed to connect to MongoDB after maximum retries');
}

export function getConnectionStatus() {
  return isConnected;
}
```

- [ ] **Step 2: Test server starts with a valid MONGO_URI**

Create a `.env` file with your Atlas connection string, then run:
Run: `cd /Users/shipsy/Desktop/gen-ai-project && node src/server/index.js`
Expected: "MongoDB connected" then "Cortex server running on port 3000"

- [ ] **Step 3: Test health endpoint**

Run: `curl http://localhost:3000/api/health`
Expected: `{"status":"ok","timestamp":"..."}`

- [ ] **Step 4: Commit**

```bash
git add src/server/db/connection.js
git commit -m "feat: add mongoose connection with retry logic"
```

---

### Task 4: Session Model

**Files:**
- Create: `src/server/db/models/Session.js`

- [ ] **Step 1: Create the Session schema**

```javascript
import mongoose from 'mongoose';

const sessionEventSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
}, { _id: false });

const lineVersionSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  content: { type: String },
  metrics: { type: mongoose.Schema.Types.Mixed },
}, { _id: false });

const testResultSchema = new mongoose.Schema({
  testId: { type: String, required: true },
  passed: { type: Boolean, required: true },
  input: { type: mongoose.Schema.Types.Mixed },
  expected: { type: mongoose.Schema.Types.Mixed },
  actual: { type: mongoose.Schema.Types.Mixed },
  executionTime: { type: Number },
}, { _id: false });

const submissionSchema = new mongoose.Schema({
  code: String,
  output: String,
  error: String,
  testResults: [testResultSchema],
  isSubmission: { type: Boolean, default: false },
  timestamp: { type: Number, default: () => Date.now() },
}, { _id: false });

const tabEventSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true },
  type: { type: String, required: true },
  durationMs: { type: Number },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true, unique: true },
  language: { type: String, required: true },
  initialCode: { type: String, required: true },
  startTime: { type: Number, required: true },
  endTime: { type: Number },
  timeLimit: { type: Number },
  difficulty: { type: String },
  questionId: { type: String },
  status: { type: String, default: 'active', enum: ['active', 'submitted', 'timeout', 'abandoned'] },

  candidate: {
    name: { type: String },
    email: { type: String },
  },

  events: { type: [sessionEventSchema], default: [] },
  lineHistory: { type: Map, of: [lineVersionSchema], default: {} },
  tabEvents: { type: [tabEventSchema], default: [] },
  all_submissions: { type: [submissionSchema], default: [] },

  finalResults: {
    publicPassed: Number,
    publicTotal: Number,
    hiddenPassed: Number,
    hiddenTotal: Number,
    allPassed: Boolean,
  },

  interviewSummary: {
    summary: String,
    strengths: [String],
    weaknesses: [String],
    rating: String,
    generatedAt: Date,
  },

  meta: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

export const Session = mongoose.model('Session', sessionSchema);
```

- [ ] **Step 2: Commit**

```bash
git add src/server/db/models/Session.js
git commit -m "feat: add Session mongoose model"
```

---

### Task 5: Config Defaults and Question Bank

**Files:**
- Create: `src/server/config/defaults.js`
- Create: `src/server/config/questions.json`

- [ ] **Step 1: Create defaults.js with language configs**

```javascript
export const LANGUAGE_CONFIG = {
  python: {
    image: 'python:3.9-custom',
    filename: 'main.py',
    timeout: 10000,
    runCmd: (workdir) => `python3 /work/${workdir}`,
    checkCmd: (workdir) => `python3 -m py_compile /work/${workdir}`,
  },
  javascript: {
    image: 'node:18-custom',
    filename: 'main.js',
    timeout: 10000,
    runCmd: (workdir) => `node /work/${workdir}`,
    checkCmd: (workdir) => `node --check /work/${workdir}`,
  },
  java: {
    image: 'openjdk:11-custom',
    filename: 'Main.java',
    timeout: 15000,
    runCmd: () => `cd /work && javac Main.java && java Main`,
    checkCmd: () => `cd /work && javac Main.java`,
  },
  c: {
    image: 'gcc:latest-custom',
    filename: 'main.c',
    timeout: 15000,
    runCmd: (f) => `cd /work && gcc ${f} -o main && ./main`,
    checkCmd: (f) => `cd /work && gcc -fsyntax-only ${f}`,
  },
  cpp: {
    image: 'gcc:latest-custom',
    filename: 'main.cpp',
    timeout: 15000,
    runCmd: (f) => `cd /work && g++ ${f} -o main && ./main`,
    checkCmd: (f) => `cd /work && g++ -fsyntax-only ${f}`,
  },
};

export const DOCKER_FLAGS = '--rm --cpus=0.5 --memory=256m --network=none --pids-limit=50';

export const HEURISTIC_DEFAULTS = {
  weights: [0.15, 0.25, 0.20, 0.10, 0.10, 0.10, 0.10],
  thresholds: { easy: 70, medium: 55, hard: 40 },
  gracePeriodMs: 90000,
  cooldownMs: 60000,
  warmZoneOffset: 15,
};

export const SESSION_DEFAULTS = {
  timeLimitMs: parseInt(process.env.SESSION_TIME_LIMIT_MS || '2700000', 10),
};
```

- [ ] **Step 2: Create questions.json with one seeded question (Two Sum)**

```json
[
  {
    "id": "dsa-easy-001",
    "title": "Two Sum",
    "Full_question": "Given an array of integers nums and an integer target, return the indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.",
    "short_description": "Find two numbers in an array that sum up to a specific target.",
    "difficulty": { "numeric": 2, "label": "easy" },
    "concepts": ["array", "hashing"],
    "canonical_skeleton": {
      "python": "def two_sum(nums, target):\n    # Write your solution here\n    pass",
      "javascript": "function twoSum(nums, target) {\n    // Write your solution here\n}",
      "java": "import java.util.*;\n\npublic class Main {\n    public static int[] twoSum(int[] nums, int target) {\n        // Write your solution here\n        return new int[]{};\n    }\n\n    public static void main(String[] args) {\n        // Test your solution\n    }\n}",
      "c": "#include <stdio.h>\n#include <stdlib.h>\n\nint* twoSum(int* nums, int numsSize, int target, int* returnSize) {\n    // Write your solution here\n    *returnSize = 0;\n    return NULL;\n}",
      "cpp": "#include <iostream>\n#include <vector>\n#include <unordered_map>\nusing namespace std;\n\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};"
    },
    "function_name": {
      "python": "two_sum",
      "javascript": "twoSum",
      "java": "twoSum",
      "c": "twoSum",
      "cpp": "twoSum"
    },
    "test_harness": {
      "python": "import json, sys\n_tests = json.loads(sys.stdin.read())\n_results = []\nfor _t in _tests:\n    try:\n        import time as _time\n        _s = _time.time()\n        _out = two_sum(_t['nums'], _t['target'])\n        _results.append({'output': _out, 'error': None, 'time_ms': round((_time.time() - _s) * 1000)})\n    except Exception as _e:\n        _results.append({'output': None, 'error': str(_e), 'time_ms': 0})\nprint(json.dumps(_results))",
      "javascript": "const fs = require('fs');\nconst input = fs.readFileSync('/dev/stdin', 'utf8');\nconst tests = JSON.parse(input);\nconst results = tests.map(t => {\n  try {\n    const start = Date.now();\n    const out = twoSum(t.nums, t.target);\n    return { output: out, error: null, time_ms: Date.now() - start };\n  } catch (e) {\n    return { output: null, error: e.message, time_ms: 0 };\n  }\n});\nconsole.log(JSON.stringify(results));"
    },
    "public_tests": [
      { "input": { "nums": [2, 7, 11, 15], "target": 9 }, "output": [0, 1] },
      { "input": { "nums": [3, 2, 4], "target": 6 }, "output": [1, 2] },
      { "input": { "nums": [3, 3], "target": 6 }, "output": [0, 1] }
    ],
    "hidden_tests": [
      { "input": { "nums": [-1, -3, 5, 9], "target": 4 }, "output": [0, 2] },
      { "input": { "nums": [1, 2, 3, 4, 5], "target": 9 }, "output": [3, 4] },
      { "input": { "nums": [0, 0], "target": 0 }, "output": [0, 1] }
    ],
    "hint_templates": [
      { "nudge": "What data structure allows O(1) lookups?" },
      { "guide": "Consider using a hash map. As you iterate, store each number. For each new number, check if its complement exists in the map." },
      { "direction": "Create an empty dictionary. Loop through the array with enumerate. For each value, compute target - value. Check if that complement is already in your dictionary. If yes, return both indices. If no, store the current value and index." }
    ],
    "constraints": { "time_ms": 5000, "memory_mb": 256 },
    "edge_cases": ["Negative numbers", "Duplicate values", "Minimum array size (2 elements)"]
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add src/server/config/defaults.js src/server/config/questions.json
git commit -m "feat: add language config defaults and question bank"
```

---

### Task 6: Code Runner Service

**Files:**
- Create: `src/server/services/codeRunner.js`
- Create: `tests/server/services/codeRunner.test.js`

- [ ] **Step 1: Write the test file**

```javascript
import { describe, test, expect } from '@jest/globals';
import { buildDockerCommand, parseExecutionResult } from '../../../src/server/services/codeRunner.js';

describe('codeRunner', () => {
  test('buildDockerCommand generates correct command for python', () => {
    const cmd = buildDockerCommand('python', '/tmp/abc123');
    expect(cmd).toContain('python:3.9-custom');
    expect(cmd).toContain('--network=none');
    expect(cmd).toContain('--memory=256m');
    expect(cmd).toContain('--pids-limit=50');
    expect(cmd).toContain('/tmp/abc123:/work');
  });

  test('buildDockerCommand generates correct command for java', () => {
    const cmd = buildDockerCommand('java', '/tmp/abc123');
    expect(cmd).toContain('openjdk:11-custom');
    expect(cmd).toContain('javac Main.java');
  });

  test('buildDockerCommand throws for unsupported language', () => {
    expect(() => buildDockerCommand('ruby', '/tmp/abc')).toThrow('Unsupported language');
  });

  test('parseExecutionResult formats timeout error', () => {
    const result = parseExecutionResult({ code: 'TIMEOUT' }, '', 'timed out');
    expect(result.error).toContain('timed out');
  });

  test('parseExecutionResult returns stdout on success', () => {
    const result = parseExecutionResult(null, 'Hello World\n', '');
    expect(result.output).toBe('Hello World\n');
    expect(result.error).toBe('');
  });

  test('parseExecutionResult formats python error', () => {
    const stderr = 'File "main.py", line 5\nSyntaxError: invalid syntax';
    const result = parseExecutionResult({ code: 1 }, '', stderr);
    expect(result.error).toContain('Syntax Error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=codeRunner`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement codeRunner.js**

```javascript
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { LANGUAGE_CONFIG, DOCKER_FLAGS } from '../config/defaults.js';

export function buildDockerCommand(language, hostDir) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const cmd = config.runCmd(config.filename);
  return `docker run ${DOCKER_FLAGS} -v "${hostDir}:/work" ${config.image} sh -c "${cmd}"`;
}

export function buildCheckCommand(language, hostDir) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const cmd = config.checkCmd(config.filename);
  return `docker run ${DOCKER_FLAGS} -v "${hostDir}:/work" ${config.image} sh -c "${cmd}"`;
}

export function parseExecutionResult(err, stdout, stderr) {
  if (err) {
    if (err.code === 'TIMEOUT' || (err.killed && !stdout)) {
      return { output: '', error: 'Execution timed out. Your code took too long to run.' };
    }

    let errorMessage = stderr || err.message || 'Execution failed';

    if (errorMessage.includes('SyntaxError')) errorMessage = `Syntax Error:\n${errorMessage}`;
    else if (errorMessage.includes('ReferenceError')) errorMessage = `Reference Error:\n${errorMessage}`;
    else if (errorMessage.includes('TypeError')) errorMessage = `Type Error:\n${errorMessage}`;
    else if (errorMessage.includes('NameError')) errorMessage = `Name Error:\n${errorMessage}`;
    else if (errorMessage.includes('IndentationError')) errorMessage = `Indentation Error:\n${errorMessage}`;
    else if (errorMessage.includes('error:')) errorMessage = `Compilation Error:\n${errorMessage}`;

    return { output: stdout || '', error: errorMessage };
  }

  return { output: stdout || '', error: stderr || '' };
}

export async function runCode(language, code, stdinInput = null) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const runId = uuid();
  const tmpBase = path.resolve('tmp');
  const runDir = path.join(tmpBase, runId);

  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, config.filename), code);

  const command = buildDockerCommand(language, runDir);

  return new Promise((resolve) => {
    const child = exec(command, {
      timeout: config.timeout,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      // Cleanup
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
      resolve(parseExecutionResult(err, stdout, stderr));
    });

    // Pipe stdin if provided (for test cases)
    if (stdinInput !== null && child.stdin) {
      child.stdin.write(stdinInput);
      child.stdin.end();
    }
  });
}

export async function checkSyntax(language, code) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  const runId = uuid();
  const tmpBase = path.resolve('tmp');
  const runDir = path.join(tmpBase, runId);

  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, config.filename), code);

  const command = buildCheckCommand(language, runDir);

  return new Promise((resolve) => {
    exec(command, {
      timeout: config.timeout,
      maxBuffer: 1024 * 1024,
    }, (err, stdout, stderr) => {
      try { fs.rmSync(runDir, { recursive: true, force: true }); } catch (_) {}
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=codeRunner`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/codeRunner.js tests/server/services/codeRunner.test.js
git commit -m "feat: add docker code runner service with tests"
```

---

### Task 7: Test Case Runner Service

**Files:**
- Create: `src/server/services/testCaseRunner.js`
- Create: `tests/server/services/testCaseRunner.test.js`

- [ ] **Step 1: Write the test file**

```javascript
import { describe, test, expect } from '@jest/globals';
import { buildTestHarnessCode, compareOutput, buildTestResults } from '../../../src/server/services/testCaseRunner.js';

describe('testCaseRunner', () => {
  test('buildTestHarnessCode wraps python code with harness', () => {
    const candidateCode = 'def two_sum(nums, target):\n    return [0, 1]';
    const harness = 'import json, sys\nprint(json.dumps([]))';
    const result = buildTestHarnessCode(candidateCode, harness);
    expect(result).toContain('def two_sum');
    expect(result).toContain('import json, sys');
    expect(result.indexOf('def two_sum')).toBeLessThan(result.indexOf('import json, sys'));
  });

  test('compareOutput matches exact arrays', () => {
    expect(compareOutput([0, 1], [0, 1])).toBe(true);
  });

  test('compareOutput matches arrays regardless of order', () => {
    expect(compareOutput([1, 0], [0, 1])).toBe(true);
  });

  test('compareOutput rejects different values', () => {
    expect(compareOutput([0, 2], [0, 1])).toBe(false);
  });

  test('compareOutput matches primitives', () => {
    expect(compareOutput(42, 42)).toBe(true);
    expect(compareOutput('hello', 'hello')).toBe(true);
  });

  test('compareOutput rejects mismatched primitives', () => {
    expect(compareOutput(42, 43)).toBe(false);
  });

  test('buildTestResults creates correct structure', () => {
    const rawResults = [
      { output: [0, 1], error: null, time_ms: 5 },
      { output: [1, 2], error: null, time_ms: 3 },
    ];
    const tests = [
      { input: { nums: [2, 7], target: 9 }, output: [0, 1] },
      { input: { nums: [3, 2, 4], target: 6 }, output: [1, 2] },
    ];
    const results = buildTestResults(rawResults, tests, 'public');
    expect(results).toHaveLength(2);
    expect(results[0].testId).toBe('public-0');
    expect(results[0].passed).toBe(true);
    expect(results[1].testId).toBe('public-1');
    expect(results[1].passed).toBe(true);
  });

  test('buildTestResults marks failed test', () => {
    const rawResults = [
      { output: [0, 0], error: null, time_ms: 5 },
    ];
    const tests = [
      { input: { nums: [3, 3], target: 6 }, output: [0, 1] },
    ];
    const results = buildTestResults(rawResults, tests, 'public');
    expect(results[0].passed).toBe(false);
    expect(results[0].actual).toEqual([0, 0]);
    expect(results[0].expected).toEqual([0, 1]);
  });

  test('buildTestResults handles runtime error', () => {
    const rawResults = [
      { output: null, error: 'NameError: name x is not defined', time_ms: 0 },
    ];
    const tests = [
      { input: { nums: [1, 2], target: 3 }, output: [0, 1] },
    ];
    const results = buildTestResults(rawResults, tests, 'hidden');
    expect(results[0].passed).toBe(false);
    expect(results[0].testId).toBe('hidden-0');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=testCaseRunner`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement testCaseRunner.js**

```javascript
import { runCode } from './codeRunner.js';

export function buildTestHarnessCode(candidateCode, harnessTemplate) {
  return `${candidateCode}\n\n${harnessTemplate}`;
}

export function compareOutput(actual, expected) {
  // Handle null/undefined
  if (actual === expected) return true;
  if (actual == null || expected == null) return false;

  // Arrays: compare sorted (order-insensitive)
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    const sortedActual = [...actual].sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1);
    const sortedExpected = [...expected].sort((a, b) => JSON.stringify(a) > JSON.stringify(b) ? 1 : -1);
    return JSON.stringify(sortedActual) === JSON.stringify(sortedExpected);
  }

  // Objects: deep compare
  if (typeof actual === 'object' && typeof expected === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  // Primitives
  return actual === expected;
}

export function buildTestResults(rawResults, testDefinitions, prefix) {
  return testDefinitions.map((testDef, index) => {
    const raw = rawResults[index] || { output: null, error: 'No result returned', time_ms: 0 };
    const passed = raw.error === null && compareOutput(raw.output, testDef.output);

    return {
      testId: `${prefix}-${index}`,
      passed,
      input: testDef.input,
      expected: testDef.output,
      actual: raw.output,
      executionTime: raw.time_ms || 0,
    };
  });
}

export async function runTestCases(language, candidateCode, question, includeHidden) {
  const harness = question.test_harness?.[language];
  if (!harness) {
    return { error: `No test harness available for language: ${language}`, testResults: [] };
  }

  const wrappedCode = buildTestHarnessCode(candidateCode, harness);

  // Build test input array
  const publicTests = question.public_tests || [];
  const hiddenTests = includeHidden ? (question.hidden_tests || []) : [];
  const allTestInputs = [...publicTests.map((t) => t.input), ...hiddenTests.map((t) => t.input)];

  if (allTestInputs.length === 0) {
    return { error: null, testResults: [] };
  }

  // Run all tests in a single Docker invocation
  const stdinData = JSON.stringify(allTestInputs);
  const result = await runCode(language, wrappedCode, stdinData);

  if (result.error && !result.output) {
    // Total failure (compilation error, etc.)
    const allTests = [...publicTests, ...(includeHidden ? hiddenTests : [])];
    return {
      error: result.error,
      testResults: allTests.map((t, i) => ({
        testId: i < publicTests.length ? `public-${i}` : `hidden-${i - publicTests.length}`,
        passed: false,
        input: t.input,
        expected: t.output,
        actual: null,
        executionTime: 0,
      })),
    };
  }

  // Parse JSON output from harness
  let rawResults;
  try {
    rawResults = JSON.parse(result.output.trim());
  } catch {
    return {
      error: `Failed to parse test harness output: ${result.output.substring(0, 200)}`,
      testResults: [],
    };
  }

  // Split results into public and hidden
  const publicResults = buildTestResults(
    rawResults.slice(0, publicTests.length),
    publicTests,
    'public'
  );
  const hiddenResults = includeHidden
    ? buildTestResults(
        rawResults.slice(publicTests.length),
        hiddenTests,
        'hidden'
      )
    : [];

  // For hidden tests, strip details (only show pass/fail)
  const sanitizedHidden = hiddenResults.map((r) => ({
    testId: r.testId,
    passed: r.passed,
    input: null,
    expected: null,
    actual: null,
    executionTime: r.executionTime,
  }));

  return {
    error: null,
    testResults: [...publicResults, ...sanitizedHidden],
  };
}
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=testCaseRunner`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/services/testCaseRunner.js tests/server/services/testCaseRunner.test.js
git commit -m "feat: add test case runner with template wrapping and single-container execution"
```

---

### Task 8: Execution Routes (/api/run, /api/check, /api/submit)

**Files:**
- Create: `src/server/routes/execution.js`
- Create: `tests/server/routes/execution.test.js`

- [ ] **Step 1: Write integration tests**

```javascript
import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { executionRouter } from '../../../src/server/routes/execution.js';

const app = express();
app.use(express.json());
app.use('/api', executionRouter);

describe('execution routes', () => {
  test('POST /api/run returns 400 if language missing', async () => {
    const res = await request(app).post('/api/run').send({ code: 'print(1)' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/run returns 400 if code missing', async () => {
    const res = await request(app).post('/api/run').send({ language: 'python' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('POST /api/run returns 400 for unsupported language', async () => {
    const res = await request(app).post('/api/run').send({ language: 'ruby', code: 'puts 1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unsupported');
  });

  test('POST /api/check returns 400 if language missing', async () => {
    const res = await request(app).post('/api/check').send({ code: 'print(1)' });
    expect(res.status).toBe(400);
  });

  test('POST /api/submit returns 400 if questionId missing', async () => {
    const res = await request(app).post('/api/submit').send({ language: 'python', code: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('questionId');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=execution`
Expected: FAIL -- module not found

- [ ] **Step 3: Implement execution.js**

```javascript
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runCode, checkSyntax } from '../services/codeRunner.js';
import { runTestCases } from '../services/testCaseRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load questions once
const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export const executionRouter = Router();

// POST /api/run -- run code, optionally against public test cases
executionRouter.post('/run', async (req, res) => {
  try {
    const { language, code, questionId } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }

    // Basic run (no test cases)
    if (!questionId) {
      const result = await runCode(language, code);
      return res.json(result);
    }

    // Run with public test cases
    const question = questions.find((q) => q.id === questionId);
    if (!question) {
      const result = await runCode(language, code);
      return res.json(result);
    }

    const { error, testResults } = await runTestCases(language, code, question, false);
    const basicResult = await runCode(language, code);

    return res.json({
      output: basicResult.output,
      error: error || basicResult.error,
      testResults,
    });
  } catch (err) {
    console.error('/api/run error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/check -- syntax-only check
executionRouter.post('/check', async (req, res) => {
  try {
    const { language, code } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }

    const result = await checkSyntax(language, code);
    return res.json(result);
  } catch (err) {
    console.error('/api/check error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/submit -- run against ALL test cases (public + hidden)
executionRouter.post('/submit', async (req, res) => {
  try {
    const { language, code, questionId } = req.body;

    if (!language || !code) {
      return res.status(400).json({ error: 'language and code are required' });
    }

    if (!questionId) {
      return res.status(400).json({ error: 'questionId is required for submission' });
    }

    const question = questions.find((q) => q.id === questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const { error, testResults } = await runTestCases(language, code, question, true);

    const publicResults = testResults.filter((r) => r.testId.startsWith('public'));
    const hiddenResults = testResults.filter((r) => r.testId.startsWith('hidden'));

    const finalResults = {
      publicPassed: publicResults.filter((r) => r.passed).length,
      publicTotal: publicResults.length,
      hiddenPassed: hiddenResults.filter((r) => r.passed).length,
      hiddenTotal: hiddenResults.length,
      allPassed: testResults.every((r) => r.passed),
    };

    return res.json({
      error,
      testResults,
      finalResults,
    });
  } catch (err) {
    console.error('/api/submit error:', err);
    return res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=execution`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/execution.js tests/server/routes/execution.test.js
git commit -m "feat: add /api/run, /api/check, /api/submit routes"
```

---

### Task 9: Questions Route

**Files:**
- Create: `src/server/routes/questions.js`
- Create: `tests/server/routes/questions.test.js`

- [ ] **Step 1: Write tests**

```javascript
import { describe, test, expect } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { questionsRouter } from '../../../src/server/routes/questions.js';

const app = express();
app.use(express.json());
app.use('/api', questionsRouter);

describe('questions routes', () => {
  test('GET /api/questions returns all questions', async () => {
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  test('GET /api/questions/:id returns specific question', async () => {
    const res = await request(app).get('/api/questions/dsa-easy-001');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.question.id).toBe('dsa-easy-001');
    expect(res.body.question.title).toBe('Two Sum');
  });

  test('GET /api/questions/:id returns 404 for unknown id', async () => {
    const res = await request(app).get('/api/questions/nonexistent');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=questions`
Expected: FAIL

- [ ] **Step 3: Implement questions.js**

```javascript
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const questionsPath = path.join(__dirname, '..', 'config', 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf-8'));
} catch (err) {
  console.error('Failed to load questions.json:', err.message);
}

export const questionsRouter = Router();

// GET /api/questions -- return all questions
questionsRouter.get('/questions', (req, res) => {
  // Strip hidden_tests and canonical_solution from response
  const safe = questions.map(({ hidden_tests, canonical_solution, ...rest }) => rest);
  return res.json({ ok: true, total: safe.length, questions: safe });
});

// GET /api/questions/:id -- return single question by id
questionsRouter.get('/questions/:id', (req, res) => {
  const q = questions.find((item) => item.id === req.params.id);
  if (!q) {
    return res.status(404).json({ error: 'Question not found' });
  }
  const { hidden_tests, canonical_solution, ...safe } = q;
  return res.json({ ok: true, question: safe });
});
```

- [ ] **Step 4: Run tests**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test -- --testPathPattern=questions`
Expected: All 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/routes/questions.js tests/server/routes/questions.test.js
git commit -m "feat: add questions API routes"
```

---

### Task 10: Wire Routes into Server + Docker Images

**Files:**
- Modify: `src/server/index.js`
- Create: `docker/python/Dockerfile`
- Create: `docker/node/Dockerfile`
- Create: `docker/java/Dockerfile`
- Create: `docker/c/Dockerfile`
- Create: `docker/cpp/Dockerfile`
- Create: `build-images.sh`

- [ ] **Step 1: Wire routes into index.js**

Add these lines to `src/server/index.js` after the cors middleware and before the health check:

```javascript
import { executionRouter } from './routes/execution.js';
import { questionsRouter } from './routes/questions.js';

// ... after app.use(cors());
app.use('/api', executionRouter);
app.use('/api', questionsRouter);
```

- [ ] **Step 2: Create Docker images**

`docker/python/Dockerfile`:
```dockerfile
FROM python:3.9-slim
WORKDIR /work
```

`docker/node/Dockerfile`:
```dockerfile
FROM node:18-slim
WORKDIR /work
```

`docker/java/Dockerfile`:
```dockerfile
FROM openjdk:11-slim
WORKDIR /work
```

`docker/c/Dockerfile`:
```dockerfile
FROM gcc:latest
WORKDIR /work
```

`docker/cpp/Dockerfile`:
```dockerfile
FROM gcc:latest
WORKDIR /work
```

- [ ] **Step 3: Create build-images.sh**

```bash
#!/bin/bash
set -e

echo "Building Docker sandbox images..."

docker build -t python:3.9-custom ./docker/python/
docker build -t node:18-custom ./docker/node/
docker build -t openjdk:11-custom ./docker/java/
docker build -t gcc:latest-custom ./docker/c/

echo "All images built successfully."
echo ""
echo "Images:"
docker images | grep -E "python:3.9-custom|node:18-custom|openjdk:11-custom|gcc:latest-custom"
```

- [ ] **Step 4: Make build script executable and run it**

Run: `chmod +x build-images.sh && ./build-images.sh`
Expected: All 4 images built. Listed at the end.

- [ ] **Step 5: End-to-end test -- run Python code**

Start server: `node src/server/index.js`

In another terminal:
```bash
curl -X POST http://localhost:3000/api/run \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"print(2 + 3)"}'
```
Expected: `{"output":"5\n","error":""}`

- [ ] **Step 6: End-to-end test -- syntax check**

```bash
curl -X POST http://localhost:3000/api/check \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"def foo(\n  pass"}'
```
Expected: `{"ok":false,"stdout":"","stderr":"..."}`

- [ ] **Step 7: End-to-end test -- submit with test cases**

```bash
curl -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"language":"python","code":"def two_sum(nums, target):\n    seen = {}\n    for i, n in enumerate(nums):\n        c = target - n\n        if c in seen:\n            return [seen[c], i]\n        seen[n] = i\n    return []","questionId":"dsa-easy-001"}'
```
Expected: JSON with `testResults` array, `finalResults` with pass counts.

- [ ] **Step 8: Commit**

```bash
git add src/server/index.js docker/ build-images.sh
git commit -m "feat: wire routes and add docker sandbox images"
```

---

### Task 11: Jest Config

**Files:**
- Create: `jest.config.js`

- [ ] **Step 1: Create jest config for ESM**

```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: [],
  testMatch: ['**/tests/**/*.test.js'],
};
```

- [ ] **Step 2: Verify all tests pass**

Run: `cd /Users/shipsy/Desktop/gen-ai-project && npm test`
Expected: All tests across codeRunner, testCaseRunner, execution, questions PASS.

- [ ] **Step 3: Commit**

```bash
git add jest.config.js
git commit -m "chore: add jest config for ESM modules"
```

---

## Plan 1 Complete

After completing all 11 tasks, you have:
- A working Express + Socket.io server
- MongoDB Atlas connection with retry
- Session Mongoose model
- Docker sandbox code execution (5 languages)
- Test case runner with single-container execution
- `/api/run`, `/api/check`, `/api/submit` routes
- `/api/questions` and `/api/questions/:id` routes
- Question bank seeded with Two Sum
- Full test coverage for all services and routes
- Docker images built and ready

**Next plan:** Plan 2 -- Session & Telemetry System (session lifecycle, telemetry ingestion, write buffering, 30s snapshot loop)
