/**
 * Card — container padrão para painéis
 * Design System ZapERP
 */
export default function Card({ children, className = "", ...props }) {
  return (
    <div className={`ds-card ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
