/**
 * Switch — componente base do Design System ZapERP
 * Usa tokens --ds-* para consistência dark/light
 */
export default function Switch({ checked, onChange, disabled = false, "aria-label": ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`ds-switch ${checked ? "ds-switch--on" : ""}`}
      onClick={() => !disabled && onChange(!checked)}
    />
  );
}
