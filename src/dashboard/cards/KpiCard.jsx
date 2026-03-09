import Card from "../../components/ui/Card";
import "../../components/ui/card.css";

export default function KpiCard({ label, value, wide }) {
  return (
    <Card
      className="kpi-card"
      style={{ gridColumn: wide ? "span 4" : "span 1" }}
    >
      <div className="kpi-card__label">{label}</div>
      <div className="kpi-card__value">{value}</div>
    </Card>
  );
}
