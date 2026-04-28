import { resolveDepartamentoNome, safeDisplayText } from "../supervisaoUtils";

export default function SupervisaoFilters({
  filtros,
  onChangeFiltro,
  atendentes,
  departamentos,
  onReset,
}) {
  return (
    <section className="supervisao-filters">
      <input
        className="supervisao-input"
        type="text"
        placeholder="Buscar cliente, telefone ou resumo"
        value={filtros.busca}
        onChange={(e) => onChangeFiltro("busca", e.target.value)}
      />

      <select
        className="supervisao-select"
        value={filtros.atendenteId}
        onChange={(e) => onChangeFiltro("atendenteId", e.target.value)}
      >
        <option value="">Todos atendentes</option>
        {atendentes.map((item) => (
          <option key={String(item.id)} value={String(item.id)}>
            {safeDisplayText(item.nome ?? item.name, "Atendente")}
          </option>
        ))}
      </select>

      <select
        className="supervisao-select"
        value={filtros.departamento}
        onChange={(e) => onChangeFiltro("departamento", e.target.value)}
      >
        <option value="">Todos departamentos</option>
        {departamentos.map((item, idx) => {
          const label = resolveDepartamentoNome(item?.departamento ?? item);
          return (
            <option key={String(item?.departamento_id ?? item?.id ?? label ?? idx)} value={label}>
              {label}
            </option>
          );
        })}
      </select>

      <select
        className="supervisao-select"
        value={filtros.nivel}
        onChange={(e) => onChangeFiltro("nivel", e.target.value)}
      >
        <option value="">Todos níveis</option>
        <option value="normal">Normal</option>
        <option value="atencao">Atenção</option>
        <option value="prioritario">Prioritário</option>
        <option value="critico">Crítico</option>
      </select>

      <select
        className="supervisao-select"
        value={filtros.periodo}
        onChange={(e) => onChangeFiltro("periodo", e.target.value)}
      >
        <option value="hoje">Hoje</option>
        <option value="7dias">Últimos 7 dias</option>
        <option value="30dias">Últimos 30 dias</option>
        <option value="custom">Data específica</option>
      </select>

      <input
        className="supervisao-input"
        type="date"
        value={filtros.data}
        onChange={(e) => onChangeFiltro("data", e.target.value)}
      />

      <label className="supervisao-checkbox">
        <input
          type="checkbox"
          checked={filtros.somenteAtrasados}
          onChange={(e) => onChangeFiltro("somenteAtrasados", e.target.checked)}
        />
        <span>Somente atrasados</span>
      </label>

      <button type="button" className="supervisao-secondary-btn" onClick={onReset}>
        Limpar filtros
      </button>
    </section>
  );
}
