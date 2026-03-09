export default function ConversasPorAtendente({ data = [] }) {
  return (
    <div className="dash-chart-card">
      <h4 className="dash-chart-title">Conversas por Atendente</h4>

      {(!data || data.length === 0) && (
        <div className="dash-chart-empty">Nenhum dado disponível</div>
      )}

      {data.map((a, i) => (
        <div key={i} className="dash-chart-row">
          <span>{a.nome}</span>
          <strong>{a.total ?? a.total_conversas ?? 0}</strong>
        </div>
      ))}
    </div>
  )
}
