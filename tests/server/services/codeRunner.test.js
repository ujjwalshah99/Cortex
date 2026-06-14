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
    expect(cmd).toContain('eclipse-temurin:11-custom');
    expect(cmd).toContain('javac Main.java');
  });

  test('buildDockerCommand throws for unsupported language', () => {
    expect(() => buildDockerCommand('ruby', '/tmp/abc')).toThrow('Unsupported language');
  });

  test('parseExecutionResult formats timeout error', () => {
    const result = parseExecutionResult({ code: 'TIMEOUT', killed: true }, '', '');
    expect(result.error).toContain('timed out');
  });

  test('parseExecutionResult returns stdout on success', () => {
    const result = parseExecutionResult(null, 'Hello World\n', '');
    expect(result.output).toBe('Hello World\n');
    expect(result.error).toBe('');
  });

  test('parseExecutionResult formats python SyntaxError', () => {
    const stderr = 'File "main.py", line 5\nSyntaxError: invalid syntax';
    const result = parseExecutionResult({ code: 1 }, '', stderr);
    expect(result.error).toContain('Syntax Error');
  });
});
