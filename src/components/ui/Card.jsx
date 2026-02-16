export default function Card({ className = '', children }) {
  return (
    <div className={`glass-card rounded-[18px] p-4 ${className}`}>
      {children}
    </div>
  );
}
