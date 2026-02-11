export default function KpiCard({ label, value, wide }) {
  return (
    <div style={{
      gridColumn: wide ? 'span 4' : 'span 1',
      border: '1px solid #eee',
      borderRadius: 10,
      padding: 12,
      background: '#fff'
    }}>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
    </div>
  )
}
