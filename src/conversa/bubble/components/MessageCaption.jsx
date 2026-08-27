import { renderTextWithLinks } from "../../utils/conversaViewFormat";

export default function MessageCaption({ texto, show }) {
  if (!show) return null;
  return <div className="wa-bubble-caption">{renderTextWithLinks(texto)}</div>;
}

export function AudioCaption({ texto, show }) {
  if (!show) return null;
  return <div className="wa-bubble-audioCaption">{renderTextWithLinks(texto)}</div>;
}
