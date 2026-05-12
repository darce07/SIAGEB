import { useEffect } from 'react';

export default function Toast({ message, onClose, positionClass = 'bottom-6 right-6' }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onClose(), 2600);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className={`fixed z-[60] rounded-2xl border border-emerald-500/30 bg-emerald-500/20 px-5 py-3 text-sm text-emerald-100 shadow-lg ${positionClass}`}>
      {message}
    </div>
  );
}
