import { safeDisplayText } from "../supervisaoUtils";

export default function SupervisaoTopCards({ cards }) {
  return (
    <section className="supervisao-cards" aria-label="Indicadores da fila">
      {cards.map((card) => (
        <article
          key={card.key}
          className={`supervisao-card supervisao-card--${card.accent ?? "default"}`}
        >
          <div className="supervisao-card-value">{safeDisplayText(card.value, "—")}</div>
          <span className="supervisao-card-label">{safeDisplayText(card.label, "")}</span>
        </article>
      ))}
    </section>
  );
}
