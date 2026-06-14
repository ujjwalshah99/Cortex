import React from 'react';
import type { QuestionItem } from '../types';

const QuestionPanel: React.FC<{ question: QuestionItem | null }> = ({ question }) => {
  if (!question) return <div className="question-panel"><p>Loading question...</p></div>;
  return (
    <div className="question-panel">
      <h3>{question.title}</h3>
      <div className="question-meta">
        <span className={`difficulty-badge ${question.difficulty?.label || ''}`}>{question.difficulty?.label}</span>
        {question.concepts?.map(c => <span key={c} className="concept-badge">{c}</span>)}
      </div>
      {question.short_description && <p className="question-desc">{question.short_description}</p>}
      {question.Full_question && <div className="question-section"><h4>Problem</h4><div className="question-text">{question.Full_question}</div></div>}
      {question.constraints && (
        <div className="question-section"><h4>Constraints</h4>
          <ul>{question.constraints.time_ms && <li>Time: {question.constraints.time_ms}ms</li>}{question.constraints.memory_mb && <li>Memory: {question.constraints.memory_mb}MB</li>}</ul>
        </div>
      )}
      {question.public_tests && question.public_tests.length > 0 && (
        <div className="question-section"><h4>Examples</h4>
          {question.public_tests.slice(0,3).map((t,i) => (
            <div key={i} className="test-example">
              <div className="test-label">Example {i+1}</div>
              <div className="test-io"><div><strong>Input:</strong> <code>{JSON.stringify(t.input)}</code></div><div><strong>Output:</strong> <code>{JSON.stringify(t.output)}</code></div></div>
              {t.explanation && <div className="test-explanation">{t.explanation}</div>}
            </div>
          ))}
        </div>
      )}
      {question.edge_cases && question.edge_cases.length > 0 && (
        <div className="question-section"><h4>Edge Cases</h4><ul>{question.edge_cases.map((e,i) => <li key={i}>{e}</li>)}</ul></div>
      )}
    </div>
  );
};
export default QuestionPanel;
