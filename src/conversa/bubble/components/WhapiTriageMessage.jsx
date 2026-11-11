export default function WhapiTriageMessage({ meta, texto }) {
  const options = Array.isArray(meta?.options) ? meta.options : [];
  // Mensagem de lista (WhatsApp): mostra só o texto + o botão "Selecionar setor",
  // igual ao cliente. As opções ficam escondidas atrás do botão (não poluem a tela).
  const isList = meta?.mode === "list" && !!meta?.button_label;
  return (
    <div className="wa-triage" aria-label="Menu de triagem">
      <div className="wa-triage__title">{meta?.header || meta?.body || texto || "Selecione uma opção"}</div>
      {meta?.footer ? <div className="wa-triage__footer">{meta.footer}</div> : null}
      {isList ? (
        <div className="wa-triage__listBtn" role="button" aria-label={meta.button_label}>
          <svg className="wa-triage__listBtnIcon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M3 6h2v2H3V6Zm4 0h14v2H7V6ZM3 11h2v2H3v-2Zm4 0h14v2H7v-2ZM3 16h2v2H3v-2Zm4 0h14v2H7v-2Z"
            />
          </svg>
          <span>{meta.button_label}</span>
        </div>
      ) : (
        <div className="wa-triage__options">
          {options.map((option, index) => (
            <div className="wa-triage__option" key={`${option.id || option.title}-${index}`}>
              <span className="wa-triage__index">{index + 1}</span>
              <span>{option.title || option.label || String(option)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="wa-triage__hint">Menu enviado ao cliente pelo WhatsApp</div>
    </div>
  );
}
