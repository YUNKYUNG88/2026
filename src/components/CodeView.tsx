import { useState, useEffect, useRef } from 'react';

interface CodeViewProps {
  code: string;
  isStreaming?: boolean;
}

export function CodeView({ code, isStreaming = false }: CodeViewProps) {
  const [copied, setCopied] = useState(false);
  const blockRef = useRef<HTMLPreElement>(null);

  // 스트리밍 중에는 새 코드가 보이도록 아래로 따라간다.
  useEffect(() => {
    if (isStreaming && blockRef.current) {
      blockRef.current.scrollTop = blockRef.current.scrollHeight;
    }
  }, [code, isStreaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-panel">
      <div className="panel-header">
        <h3>코드</h3>
        <button className="btn-copy" onClick={handleCopy} disabled={isStreaming}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre className="code-block" ref={blockRef}>
        <code>{code}</code>
        {isStreaming && <span className="stream-caret" aria-hidden="true" />}
      </pre>
    </div>
  );
}
