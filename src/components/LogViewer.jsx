import { useLayoutEffect, useRef } from "react";

export function LogViewer({ content, emptyMessage, ariaLabel }) {
  const elementRef = useRef(null);
  const followsTailRef = useRef(true);
  const previousContentRef = useRef("");

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    const firstOutput = !previousContentRef.current && Boolean(content);
    if (followsTailRef.current || firstOutput) {
      element.scrollTop = element.scrollHeight;
    }
    previousContentRef.current = content || "";
  }, [content]);

  function rememberScrollPosition(event) {
    const element = event.currentTarget;
    const distanceFromBottom =
      element.scrollHeight - element.clientHeight - element.scrollTop;
    followsTailRef.current = distanceFromBottom <= 24;
  }

  return (
    <pre
      className="log-viewer"
      ref={elementRef}
      onScroll={rememberScrollPosition}
      aria-label={ariaLabel}
      tabIndex="0"
    >
      {content || emptyMessage}
    </pre>
  );
}
