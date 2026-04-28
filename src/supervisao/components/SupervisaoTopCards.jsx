import { safeDisplayText } from "../supervisaoUtils";

export default function SupervisaoTopCards({ cards }) {
  return (
    <section className="supervisao-cards">
      {cards.map((card) => (
        <article key={card.key} className="supervisao-card">
          <strong>{safeDisplayText(card.value, "—")}</strong>
          <span>{safeDisplayText(card.label, "")}</span>
        </article>
      ))}
    </section>
  );
}
