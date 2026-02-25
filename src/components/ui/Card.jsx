export default function Card({ className = '', children }) {
  return (
    <div className={`glass-card rounded-2xl p-3.5 md:p-4 ${className}`}>
      {children}
    </div>
  );
}
