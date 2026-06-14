import React from 'react';
import Editor from '@monaco-editor/react';

const LANG_MAP: Record<string, string> = { python: 'python', javascript: 'javascript', java: 'java', c: 'c', cpp: 'cpp' };

interface Props { code: string; language: string; onCodeChange: (c: string) => void; onEditorMount: (editor: any, monaco: any) => void; readOnly?: boolean; }

const CodeEditor: React.FC<Props> = ({ code, language, onCodeChange, onEditorMount, readOnly }) => (
  <div className="code-editor-container">
    <Editor height="100%" language={LANG_MAP[language] || 'python'} value={code}
      onChange={v => onCodeChange(v || '')} onMount={onEditorMount} theme="vs-dark"
      options={{
        readOnly: readOnly || false, minimap: { enabled: false }, fontSize: 14,
        lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true,
        quickSuggestions: false, suggestOnTriggerCharacters: false,
        acceptSuggestionOnEnter: 'off', tabCompletion: 'off', wordBasedSuggestions: 'off',
        folding: true, matchBrackets: 'always', autoClosingBrackets: 'languageDefined',
        autoClosingQuotes: 'languageDefined', insertSpaces: true, tabSize: 4,
        suggest: { showKeywords: false, showSnippets: false, showFunctions: false, showConstructors: false, showFields: false, showVariables: false, showClasses: false, showStructs: false, showInterfaces: false, showModules: false, showProperties: false, showEvents: false, showOperators: false, showUnits: false, showValues: false, showConstants: false, showEnums: false, showEnumMembers: false, showColors: false, showFiles: false, showReferences: false, showFolders: false, showTypeParameters: false, showIssues: false, showUsers: false, showWords: false },
      }}
    />
  </div>
);
export default CodeEditor;
