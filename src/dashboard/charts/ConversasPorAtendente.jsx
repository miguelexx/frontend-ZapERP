export default function ConversasPorAtendente({ data = [] }) {
  return (
    <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12 }}>
      <h4>Conversas por Atendente</h4>

      {(!data || data.length === 0) && (
        <div style={{ fontSize: 12, color: '#666' }}>
          Nenhum dado disponível
        </div>
      )}

      {data.map((a, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '4px 0'
          }}
        >
          <span>{a.nome}</span>
          <strong>{a.total ?? a.total_conversas ?? 0}</strong>
        </div>
      ))}
    </div>
  )
}
