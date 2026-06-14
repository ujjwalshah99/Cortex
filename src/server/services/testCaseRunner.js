import { runCode } from './codeRunner.js';

/**
 * Concatenates candidate code with the test harness template.
 * Candidate code comes first so the harness can call the candidate's function.
 * @param {string} candidateCode - The candidate's solution code
 * @param {string} harnessTemplate - The test harness code
 * @returns {string} Combined code
 */
export function buildTestHarnessCode(candidateCode, harnessTemplate) {
  return `${candidateCode}\n\n${harnessTemplate}`;
}

/**
 * Deep comparison of actual vs expected output.
 * For arrays: order-insensitive sorted comparison.
 * For objects: JSON stringify comparison.
 * For primitives: strict equality.
 * @param {*} actual
 * @param {*} expected
 * @returns {boolean}
 */
export function compareOutput(actual, expected) {
  if (actual === null || actual === undefined || expected === null || expected === undefined) {
    return actual === expected;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) return false;
    const sortedActual = [...actual].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    const sortedExpected = [...expected].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    return sortedActual.every((val, i) => val === sortedExpected[i]);
  }

  if (typeof actual === 'object' && typeof expected === 'object') {
    return JSON.stringify(actual) === JSON.stringify(expected);
  }

  return actual === expected;
}

/**
 * Builds an array of test result objects from raw harness output and test definitions.
 * @param {Array} rawResults - Parsed JSON array from harness output, each: { output, error, time_ms }
 * @param {Array} testDefinitions - Test definitions from questions.json, each: { input, output }
 * @param {string} prefix - "public" or "hidden"
 * @returns {Array} Array of { testId, passed, input, expected, actual, executionTime }
 */
export function buildTestResults(rawResults, testDefinitions, prefix) {
  return testDefinitions.map((testDef, index) => {
    const raw = rawResults[index] || { output: null, error: 'No result', time_ms: 0 };
    const hasError = raw.error !== null && raw.error !== undefined;
    const passed = !hasError && compareOutput(raw.output, testDef.output);

    return {
      testId: `${prefix}-${index}`,
      passed,
      input: testDef.input,
      expected: testDef.output,
      actual: raw.output,
      executionTime: raw.time_ms,
    };
  });
}

/**
 * Main function: runs all test cases for a question against candidate code in a single Docker container.
 * @param {string} language - The programming language
 * @param {string} candidateCode - The candidate's solution code
 * @param {object} question - Question object from questions.json
 * @param {boolean} includeHidden - Whether to include hidden tests
 * @returns {Promise<{ error: string|null, testResults: Array }>}
 */
export async function runTestCases(language, candidateCode, question, includeHidden = false) {
  const harnessTemplate = question.test_harness?.[language];
  if (!harnessTemplate) {
    return {
      error: `No test harness available for language: ${language}`,
      testResults: [],
    };
  }

  const fullCode = buildTestHarnessCode(candidateCode, harnessTemplate);

  const publicTests = question.public_tests || [];
  const hiddenTests = includeHidden ? (question.hidden_tests || []) : [];
  const allTests = [...publicTests, ...hiddenTests];

  // Build the input array: extract each test's input object
  const inputs = allTests.map((t) => t.input);
  const stdinInput = JSON.stringify(inputs);

  const { output, error } = await runCode(language, fullCode, stdinInput);

  // Handle total failure (compilation/runtime error before any output)
  if (error && (!output || output.trim() === '')) {
    const makeFailedResult = (testDef, index, prefix) => ({
      testId: `${prefix}-${index}`,
      passed: false,
      input: testDef.input,
      expected: testDef.output,
      actual: null,
      executionTime: 0,
    });

    const publicResults = publicTests.map((t, i) => makeFailedResult(t, i, 'public'));
    const hiddenResults = hiddenTests.map((t, i) => {
      const result = makeFailedResult(t, i, 'hidden');
      result.input = null;
      result.expected = null;
      result.actual = null;
      return result;
    });

    return {
      error,
      testResults: [...publicResults, ...hiddenResults],
    };
  }

  // Parse the JSON array output from the harness
  let rawResults;
  try {
    rawResults = JSON.parse(output.trim());
  } catch (parseError) {
    const makeFailedResult = (testDef, index, prefix) => ({
      testId: `${prefix}-${index}`,
      passed: false,
      input: testDef.input,
      expected: testDef.output,
      actual: null,
      executionTime: 0,
    });

    const publicResults = publicTests.map((t, i) => makeFailedResult(t, i, 'public'));
    const hiddenResults = hiddenTests.map((t, i) => {
      const result = makeFailedResult(t, i, 'hidden');
      result.input = null;
      result.expected = null;
      result.actual = null;
      return result;
    });

    return {
      error: `Failed to parse harness output: ${parseError.message}`,
      testResults: [...publicResults, ...hiddenResults],
    };
  }

  // Split results into public and hidden
  const publicRaw = rawResults.slice(0, publicTests.length);
  const hiddenRaw = rawResults.slice(publicTests.length);

  const publicResults = buildTestResults(publicRaw, publicTests, 'public');

  let hiddenResults = [];
  if (includeHidden) {
    hiddenResults = buildTestResults(hiddenRaw, hiddenTests, 'hidden');
    // Strip details from hidden results
    hiddenResults = hiddenResults.map((r) => ({
      ...r,
      input: null,
      expected: null,
      actual: null,
    }));
  }

  return {
    error: error || null,
    testResults: [...publicResults, ...hiddenResults],
  };
}
