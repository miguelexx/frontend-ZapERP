import { Calendar } from "lucide-react";
import { getPeriodoCabecalhoText } from "./recorteTemporal.js";

/**
 * @param {{ data: unknown }} props
 */
export default function IaPeriodoCabecalho({ data }) {
  const text = getPeriodoCabecalhoText(data);
  if (!text) return null;

  return (
    <div className="ia-analitica-periodo" role="status">
      <Calendar className="ia-analitica-periodo-ico" size={18} strokeWidth={2} aria-hidden />
      <span className="ia-analitica-periodo-text">{text}</span>
    </div>
  );
}
