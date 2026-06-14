import React from 'react';
import type { TestResult } from '../types';

interface Props { output: string; error: string; testResults: TestResult[]; isRunning: boolean; }

const OutputPanel: React.FC<Props> = ({ output, error, testResults, isRunning }) => {
  if (isRunning) return <div className="output-panel"><div className="output-loading"><div className="spinner" /><span>Executing code...</span></div></div>;
  return (
    <div className="output-panel">
      {output && <div className="output-section"><h4>Output</h4><pre className="output-text">{output}</pre></div>}
      {error && <div className="output-section error"><h4>Error</h4><pre className="output-text error-text">{error}</pre></div>}
      {testResults.length > 0 && (
        <div className="output-section"><h4>Test Results</h4>
          <div className="test-results">{testResults.map(t => (
            <div key={t.testId} className={`test-result ${t.passed ? 'pass' : 'fail'}`}>
              <span className="test-status">{t.passed ? 'PASS' : 'FAIL'}</span>
              <span className="test-id">{t.testId}</span>
              {t.input !== null && <div className="test-detail"><div>Input: <code>{JSON.stringify(t.input)}</code></div><div>Expected: <code>{JSON.stringify(t.expected)}</code></div>{!t.passed && t.actual !== null && <div>Got: <code>{JSON.stringify(t.actual)}</code></div>}</div>}
              {t.input === null && !t.passed && <span className="test-hidden">(hidden test)</span>}
            </div>
          ))}</div>
          <div className="test-summary">{testResults.filter(t => t.passed).length}/{testResults.length} passed</div>
        </div>
      )}
      {!output && !error && testResults.length === 0 && <div className="output-placeholder">Click "Run" (Ctrl+Enter) to execute your code</div>}
    </div>
  );
};
export default OutputPanel;
