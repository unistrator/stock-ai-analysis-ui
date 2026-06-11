import { useEffect, useRef, useState } from "react";

const CHAR_INTERVAL_MS = 24;

/** 将目标文本以逐字方式展示，适用于流式输出场景。 */
export function useTypewriterText(
  targetText: string,
  resetKey: number | string = 0,
  enabled = true,
): string {
  const [displayText, setDisplayText] = useState("");
  const targetRef = useRef(targetText);
  targetRef.current = targetText;

  useEffect(() => {
    if (!enabled) return;
    setDisplayText("");
  }, [resetKey, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const timer = window.setInterval(() => {
      setDisplayText((prev) => {
        const target = targetRef.current;
        if (prev.length >= target.length) return prev;
        const behind = target.length - prev.length;
        const step = behind > 400 ? 16 : behind > 200 ? 8 : behind > 40 ? 4 : behind > 15 ? 2 : 1;
        return target.slice(0, prev.length + step);
      });
    }, CHAR_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [resetKey, enabled]);

  if (!enabled) return targetText;
  return displayText;
}
