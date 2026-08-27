export default function AttachmentInputs({
  fileInputRef,
  fototecaInputRef,
  cameraInputRef,
  audioInputRef,
  documentInputRef,
  stickerInputRef,
  onFileInputChange,
  onFototecaInputChange,
  onCameraInputChange,
  onDocumentInputChange,
  onStickerInputChange,
}) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".pdf,.doc,.docx,image/*,audio/*,video/*"
        onChange={onFileInputChange}
      />
      <input
        ref={fototecaInputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/jpeg,image/png,image/gif,image/webp,image/bmp,image/heic,image/heif,video/mp4,video/webm,video/3gpp,video/quicktime,video/x-msvideo"
        multiple
        onChange={onFototecaInputChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*"
        capture="environment"
        onChange={onCameraInputChange}
      />
      <input
        ref={audioInputRef}
        type="file"
        style={{ display: "none" }}
        accept="audio/*,.mp3,.m4a,.ogg,.wav,.aac,.opus,.webm"
        onChange={onFileInputChange}
      />
      <input
        ref={documentInputRef}
        type="file"
        style={{ display: "none" }}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.html,.htm,.rtf,.zip,.rar,.7z,.xml,.json,.sql,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,text/markdown,text/html,application/rtf,application/zip,application/x-zip-compressed,application/vnd.rar,application/x-rar-compressed,application/x-7z-compressed,application/xml,text/xml,application/json,application/sql"
        multiple
        onChange={onDocumentInputChange}
      />
      <input
        ref={stickerInputRef}
        type="file"
        style={{ display: "none" }}
        accept="image/*"
        onChange={onStickerInputChange}
      />
    </>
  );
}
