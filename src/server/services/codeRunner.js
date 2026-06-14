import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { LANGUAGE_CONFIG, DOCKER_FLAGS } from '../config/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is 3 levels up from src/server/services/
const PROJECT_ROOT = path.resolve(__dirname, '../../../');

/**
 * Builds the full docker run command string for executing code.
 * @param {string} language - The programming language key (e.g. 'python', 'java')
 * @param {string} hostDir - The absolute path to the host directory to mount as /work
 * @returns {string} The full docker run command
 */
export function buildDockerCommand(language, hostDir) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  const runCmd = config.runCmd(config.filename);
  return `docker run ${DOCKER_FLAGS} -v ${hostDir}:/work ${config.image} sh -c "${runCmd}"`;
}

/**
 * Builds the docker run command for syntax checking.
 * @param {string} language - The programming language key
 * @param {string} hostDir - The absolute path to the host directory to mount as /work
 * @returns {string} The full docker run command for syntax checking
 */
export function buildCheckCommand(language, hostDir) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }
  const checkCmd = config.checkCmd(config.filename);
  return `docker run ${DOCKER_FLAGS} -v ${hostDir}:/work ${config.image} sh -c "${checkCmd}"`;
}

/**
 * Parses and formats the result of a docker execution.
 * @param {object|null} err - Error object from child_process.exec, or null on success
 * @param {string} stdout - Standard output from the execution
 * @param {string} stderr - Standard error from the execution
 * @returns {{ output: string, error: string }}
 */
export function parseExecutionResult(err, stdout, stderr) {
  if (!err) {
    return { output: stdout, error: '' };
  }

  // Timeout
  if (err.killed || err.code === 'TIMEOUT' || err.signal === 'SIGTERM') {
    return { output: '', error: 'Execution timed out. Your code took too long to run.' };
  }

  // SyntaxError detection (Python, JS, etc.)
  if (stderr && stderr.includes('SyntaxError')) {
    return { output: stdout || '', error: `Syntax Error: ${stderr}` };
  }

  // Generic runtime error
  return { output: stdout || '', error: stderr || `Execution failed with code ${err.code}` };
}

/**
 * Executes code in a Docker container.
 * @param {string} language - The programming language
 * @param {string} code - The source code to run
 * @param {string|null} stdinInput - Optional stdin to pipe to the process
 * @returns {Promise<{ output: string, error: string }>}
 */
export async function runCode(language, code, stdinInput = null) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const runId = uuidv4();
  const hostDir = path.join(PROJECT_ROOT, 'tmp', runId);

  try {
    await fs.mkdir(hostDir, { recursive: true });
    await fs.writeFile(path.join(hostDir, config.filename), code, 'utf8');

    const cmd = buildDockerCommand(language, hostDir);

    const result = await new Promise((resolve) => {
      const child = exec(
        cmd,
        { timeout: config.timeout },
        (err, stdout, stderr) => {
          resolve(parseExecutionResult(err, stdout, stderr));
        }
      );

      if (stdinInput !== null && child.stdin) {
        child.stdin.write(stdinInput);
        child.stdin.end();
      }
    });

    return result;
  } finally {
    await fs.rm(hostDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Runs a syntax check on code inside a Docker container.
 * @param {string} language - The programming language
 * @param {string} code - The source code to check
 * @returns {Promise<{ ok: boolean, stdout: string, stderr: string }>}
 */
export async function checkSyntax(language, code) {
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const runId = uuidv4();
  const hostDir = path.join(PROJECT_ROOT, 'tmp', runId);

  try {
    await fs.mkdir(hostDir, { recursive: true });
    await fs.writeFile(path.join(hostDir, config.filename), code, 'utf8');

    const cmd = buildCheckCommand(language, hostDir);

    return await new Promise((resolve) => {
      exec(cmd, { timeout: config.timeout }, (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: stdout || '',
          stderr: stderr || '',
        });
      });
    });
  } finally {
    await fs.rm(hostDir, { recursive: true, force: true }).catch(() => {});
  }
}
