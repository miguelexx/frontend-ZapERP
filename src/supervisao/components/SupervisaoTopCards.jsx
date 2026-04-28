export default function SupervisaoTopCards({ cards }) {
  return (
    <section className="supervisao-cards">
      {cards.map((card) => (
        <article key={card.key} className="supervisao-card">
          <strong>{card.value}</strong>
          <span>{card.label}</span>
        </article>
      ))}
    </section>
  );
}
