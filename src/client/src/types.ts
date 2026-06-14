export interface QuestionItem {
  id: string;
  title: string;
  Full_question: string;
  short_description: string;
  difficulty: { numeric: number; label: string };
  concepts: string[];
  canonical_skeleton: Record<string, string>;
  public_tests: Array<{ input: any; output: any; explanation?: string | null }>;
  constraints?: { time_ms?: number; memory_mb?: number };
  edge_cases?: string[];
  hint_templates?: Array<{ nudge?: string; guide?: string; direction?: string }>;
}

export interface TestResult {
  testId: string;
  passed: boolean;
  input: any;
  expected: any;
  actual: any;
  executionTime: number;
}

export interface RunResult {
  output: string;
  error: string;
  testResults?: TestResult[];
}

export interface SubmitResult {
  error: string | null;
  testResults: TestResult[];
  finalResults: {
    publicPassed: number;
    publicTotal: number;
    hiddenPassed: number;
    hiddenTotal: number;
    allPassed: boolean;
  };
}

export interface TimerSync {
  elapsed: number;
  remaining: number;
  percent: number;
}

export interface SessionCreated {
  sessionId: string;
  question: QuestionItem;
  initialCode: string;
  timeLimit: number;
  startTime: number;
}

export interface SessionRestored {
  code: string;
  language: string;
  startTime: number;
  timeLimit: number;
  helpLevel: number;
  struggleScore: number;
  candidate: { name: string; email: string };
  questionId: string;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'interviewer';
  timestamp: Date;
  trigger?: string;
}
