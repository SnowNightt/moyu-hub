import { useEffect, useState } from 'react';

export function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="clock">
      <span>
        {new Intl.DateTimeFormat('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          weekday: 'short',
        }).format(now)}
      </span>
      <strong>
        {new Intl.DateTimeFormat('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(now)}
      </strong>
    </div>
  );
}
