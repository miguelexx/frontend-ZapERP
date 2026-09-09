export default function WhapiTriageMessage({ meta, texto }) {
  const options = Array.isArray(meta?.options) ? meta.options : [];
  return (
    <div className="wa-triage" aria-label="Menu de triagem">
      <div className="wa-triage__title">{meta?.header || meta?.body || texto || "Selecione uma opção"}</div>
      {meta?.footer ? <div className="wa-triage__footer">{meta.footer}</div> : null}
      <div className="wa-triage__options">
        {options.map((option, index) => (
          <div className="wa-triage__option" key={`${option.id || option.title}-${index}`}>
            <span className="wa-triage__index">{index + 1}</span>
            <span>{option.title || option.label || String(option)}</span>
          </div>
        ))}
      </div>
      {meta?.mode === "list" && meta?.button_label ? (
        <div className="wa-triage__button">{meta.button_label}</div>
      ) : null}
      <div className="wa-triage__hint">Menu enviado ao cliente pelo WhatsApp</div>
    </div>
  );
}
