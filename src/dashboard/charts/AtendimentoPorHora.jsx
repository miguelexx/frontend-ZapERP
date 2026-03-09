export default function AtendimentoPorHora({ data = [] }) {
  const dados = Array.isArray(data) ? data : []

  return (
    <>
      {dados.length === 0 && <div className="dash-chart-empty">Nenhum dado disponível</div>}
      {dados.map((h, i) => (
        <div key={i} className="dash-chart-row">
          <span>{typeof h.hora === 'string' ? h.hora : `${String(h.hora ?? '').padStart(2, '0')}:00`}</span>
          <strong>{h.total}</strong>
        </div>
      ))}
    </>
  )
}
