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
  const totalVotes = results.reduce((acc, r) => {
    const n = Number(r?.count);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  if (!title && !options.length) {
    return (
      <div className="wa-poll wa-poll--fallback">
        <span className="wa-poll-badge" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span>{texto || "Enquete"}</span>
      </div>
    );
  }

  return (
    <div className="wa-poll" aria-label="Enquete">
      <div className="wa-poll-head">
        <span className="wa-poll-badge" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h10M4 18h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <div className="wa-poll-title">{title || "Enquete"}</div>
      </div>
      <ul className="wa-poll-options">
        {options.map((opt) => {
          const isSelected = selectedSet.has(opt.toLowerCase());
          const result = results.find(
            (r) => String(r?.name || "").trim().toLowerCase() === opt.toLowerCase()
          );
          const count = result?.count != null ? Number(result.count) : null;
          const pct =
            Number.isFinite(count) && totalVotes > 0
              ? Math.round((count / totalVotes) * 100)
              : null;
          return (
            <li
              key={opt}
              className={`wa-poll-option${isSelected ? " wa-poll-option--selected" : ""}`}
            >
              {pct != null ? (
                <span
                  className="wa-poll-optionBar"
                  style={{ width: `${Math.max(pct, 0)}%` }}
                  aria-hidden="true"
                />
              ) : null}
              <span className={`wa-poll-radio${isSelected ? " is-on" : ""}`} aria-hidden="true" />
              <span className="wa-poll-optionText">{opt}</span>
              {Number.isFinite(count) && count > 0 ? (
                <span className="wa-poll-count">{pct != null ? `${pct}%` : count}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="wa-poll-hint">
        {selected.length
          ? `Cliente escolheu: ${selected.join(", ")}`
          : multi
            ? "Várias respostas · votos no WhatsApp"
            : "Escolha única · votos no WhatsApp"}
      </div>
    </div>
  );
}
