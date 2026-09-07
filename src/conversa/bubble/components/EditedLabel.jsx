import { isMessageEdited } from "../utils/bubbleClassify";

export default function EditedLabel({ msg }) {
  if (!isMessageEdited(msg)) return null;
  return (
    <span className="wa-bubble-edited" title="Mensagem editada">
      Editada
    </span>
  );
}
