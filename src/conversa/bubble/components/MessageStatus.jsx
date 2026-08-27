import { TickSvg } from "../../conversaViewIcons";
import { resolveOutgoingTick } from "../utils/bubbleStatus";

export default function MessageStatus({ msg, isGroup }) {
  const tick = resolveOutgoingTick(msg, isGroup);
  if (!tick) return null;

  return (
    <span className={tick.className} title={tick.title}>
      <TickSvg kind={tick.kind} />
    </span>
  );
}
