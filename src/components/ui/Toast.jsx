import { useEffect } from 'react';

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onClose(), 2600);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 rounded-2xl border border-emerald-500/30 bg-emerald-500/20 px-5 py-3 text-sm text-emerald-100 shadow-lg">
      {message}
    </div>
  );
}
