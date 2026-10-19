import { useCallback, useEffect, useState } from "react";

export default function useTransientNotice(duration = 4500) {
  const [notice, setNotice] = useState(null);
  // A fresh object restarts the timer even when consecutive messages match.
  const showNotice = useCallback((message) => setNotice({ message }), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(dismissNotice, duration);
    return () => window.clearTimeout(timer);
  }, [notice, duration, dismissNotice]);

  return { message: notice?.message || "", showNotice, dismissNotice };
}
