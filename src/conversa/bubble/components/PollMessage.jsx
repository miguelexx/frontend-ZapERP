export default function PollMessage({ msg, pollMeta, texto }) {
  const poll = pollMeta && typeof pollMeta === "object" ? pollMeta : null;
  const title = String(poll?.title || "").trim();
  const options = Array.isArray(poll?.options)
    ? poll.options.map((o) => String(o || "").trim()).filter(Boolean)
    : [];
  const multi = poll?.count === 0 || poll?.count === "0";

  if (!title && !options.length) {
    return <div className="wa-poll">{texto || "📊 Enquete"}</div>;
  }

  return (
    <div className="wa-poll" aria-label="Enquete">
      <div className="wa-poll-title">{title || "Enquete"}</div>
      <ul className="wa-poll-options">
        {options.map((opt) => (
          <li key={opt} className="wa-poll-option">
            <span className="wa-poll-radio" aria-hidden="true" />
            <span className="wa-poll-optionText">{opt}</span>
          </li>
        ))}
      </ul>
      <div className="wa-poll-hint">
        {multi ? "Várias respostas" : "Escolha única"} · votos no WhatsApp do cliente
      </div>
    </div>
  );
}
