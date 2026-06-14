export const LANGUAGE_CONFIG = {
  python: {
    image: 'python:3.9-custom',
    filename: 'main.py',
    timeout: 10000,
    runCmd: (f) => `python3 /work/${f}`,
    checkCmd: (f) => `python3 -m py_compile /work/${f}`,
  },
  javascript: {
    image: 'node:18-custom',
    filename: 'main.js',
    timeout: 10000,
    runCmd: (f) => `node /work/${f}`,
    checkCmd: (f) => `node --check /work/${f}`,
  },
  java: {
    image: 'eclipse-temurin:11-custom',
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
