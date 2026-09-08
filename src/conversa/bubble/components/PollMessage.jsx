export default function PollMessage({ msg, pollMeta, texto }) {
  const poll = pollMeta && typeof pollMeta === "object" ? pollMeta : null;
  const title = String(poll?.title || "").trim();
  const options = Array.isArray(poll?.options)
    ? poll.options.map((o) => String(o || "").trim()).filter(Boolean)
    : [];
  const multi = poll?.count === 0 || poll?.count === "0";
  const selected = Array.isArray(poll?.last_vote?.options)
    ? poll.last_vote.options.map((o) => String(o || "").trim()).filter(Boolean)
    : [];
  const selectedSet = new Set(selected.map((s) => s.toLowerCase()));
  const results = Array.isArray(poll?.results) ? poll.results : [];

  if (!title && !options.length) {
    return <div className="wa-poll">{texto || "📊 Enquete"}</div>;
  }

  return (
    <div className="wa-poll" aria-label="Enquete">
      <div className="wa-poll-title">{title || "Enquete"}</div>
      <ul className="wa-poll-options">
        {options.map((opt) => {
          const isSelected = selectedSet.has(opt.toLowerCase());
          const result = results.find((r) => String(r?.name || "").trim().toLowerCase() === opt.toLowerCase());
          const count = result?.count != null ? Number(result.count) : null;
          return (
            <li
              key={opt}
              className={`wa-poll-option${isSelected ? " wa-poll-option--selected" : ""}`}
            >
              <span className={`wa-poll-radio${isSelected ? " is-on" : ""}`} aria-hidden="true" />
              <span className="wa-poll-optionText">{opt}</span>
              {Number.isFinite(count) && count > 0 ? (
                <span className="wa-poll-count">{count}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="wa-poll-hint">
        {selected.length
          ? `Cliente escolheu: ${selected.join(", ")}`
          : multi
            ? "Várias respostas · votos no WhatsApp do cliente"
            : "Escolha única · votos no WhatsApp do cliente"}
      </div>
    </div>
  );
}
