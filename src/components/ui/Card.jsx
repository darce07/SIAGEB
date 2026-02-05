export default function Card({ className = '', children }) {
  return (
    <div className={`glass-card rounded-2xl p-5 ${className}`}>
      {children}
    </div>
  );
}
