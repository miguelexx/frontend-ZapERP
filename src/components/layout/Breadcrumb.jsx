/**
 * Breadcrumb — navegação contextual
 * Design System ZapERP
 */
import { Link } from "react-router-dom";

export default function Breadcrumb({ items }) {
  return (
    <nav className="ds-breadcrumb" aria-label="Breadcrumb">
      <ol className="ds-breadcrumb__list">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="ds-breadcrumb__item">
              {isLast ? (
                <span className="ds-breadcrumb__current" aria-current="page">
                  {item.label}
                </span>
              ) : item.to ? (
                <Link to={item.to} className="ds-breadcrumb__link">
                  {item.label}
                </Link>
              ) : (
                <span className="ds-breadcrumb__current">{item.label}</span>
              )}
              {!isLast && <span className="ds-breadcrumb__sep" aria-hidden>/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
