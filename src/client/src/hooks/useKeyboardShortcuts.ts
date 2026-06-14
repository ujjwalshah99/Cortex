import { useEffect } from 'react';

export function useKeyboardShortcuts(
  onRun: () => void,
  onSubmit: () => void,
  editorRef: React.RefObject<any>
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter' && e.shiftKey) { e.preventDefault(); onSubmit(); }
      else if (mod && e.key === 'Enter') { e.preventDefault(); onRun(); }
      else if (e.key === 'Escape') { editorRef.current?.focus(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onRun, onSubmit, editorRef]);
}
