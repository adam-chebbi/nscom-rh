import { useState, useEffect } from 'react';
import { format, differenceInSeconds } from 'date-fns';
import { fr } from 'date-fns/locale';

export function LiveTimer({ startTime, className }: { startTime: Date, className?: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const update = () => {
      const diff = differenceInSeconds(new Date(), startTime);
      setElapsed(diff > 0 ? diff : 0);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const formatNum = (n: number) => n.toString().padStart(2, '0');

  const colorClass = elapsed > 36000 ? 'text-red-500' : elapsed > 28800 ? 'text-amber-500' : 'text-brand';

  return (
    <span className={`${className} ${colorClass} font-mono font-bold`}>
      {formatNum(hours)}:{formatNum(minutes)}:{formatNum(seconds)}
    </span>
  );
}
