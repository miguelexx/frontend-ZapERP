import { getRecorteTemporalFromData } from "./recorteTemporal.js";

/**
 * Aviso quando o texto fala em "hoje"/"ontem" mas o recorte temporal não autoriza.
 * @param {{ answer: string, data: unknown }} props
 */
export default function IaTemporalAnswerHint({ answer, data }) {
  const recorte = getRecorteTemporalFromData(data);
  if (recorte?.pode_usar_hoje_no_texto !== false) return null;
  const a = String(answer || "");
  if (!/\b(hoje|ontem)\b/i.test(a)) return null;

  return (
    <p className="ia-analitica-temporal-hint" role="note">
      A resposta menciona “hoje” ou “ontem”, mas o período analisado é o indicado acima — use essas datas como referência.
    </p>
  );
}
