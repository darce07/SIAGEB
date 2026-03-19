export default function Card({ className = '', children }) {
  return (
    <div className={`ds-card ${className}`}>
      {children}
    </div>
  );
}
