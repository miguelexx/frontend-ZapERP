export default function AtendimentoPorHora({ data = [] }) {
  const dados = Array.isArray(data) ? data : []

  return (
    <>
      {dados.length === 0 && <div style={{ fontSize: 12, color: '#666' }}>Nenhum dado disponível</div>}
      {dados.map((h, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span>{typeof h.hora === 'string' ? h.hora : `${String(h.hora ?? '').padStart(2, '0')}:00`}</span>
          <strong>{h.total}</strong>
        </div>
      ))}
    </>
  )
}
