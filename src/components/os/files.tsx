import { useEffect, useState } from "react";
import { addNote } from "@/lib/os/desk";
import { blobOf, fileKind, forgetFile, listFiles, putFile, type ArcFile } from "@/lib/os/files";

function sizeLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileDesk() {
  const [files, setFiles] = useState<ArcFile[]>([]);
  const [status, setStatus] = useState("Die Ablage ist privat. Dateien bleiben in diesem Browser und werden nicht ins Netz gestellt. Bis 8 MB, bis 16 Stück.");
  const [preview, setPreview] = useState<{ id: string; text?: string; url?: string } | null>(null);

  useEffect(() => {
    const pull = () => {
      void listFiles().then(setFiles).catch(() => setStatus("Die Ablage ist nicht erreichbar."));
    };
    pull();
    window.addEventListener("arc-files", pull);
    return () => window.removeEventListener("arc-files", pull);
  }, []);

  async function take(list: FileList | null) {
    const file = list?.[0];
    if (!file) return;
    const result = await putFile(file);
    setStatus(result.ok ? `${result.file.name} liegt in der Ablage.` : result.error);
  }

  async function open(file: ArcFile) {
    const blob = await blobOf(file.id);
    if (!blob) return;
    if (fileKind(file) === "text" && blob.size < 200_000) {
      setPreview({ id: file.id, text: (await blob.text()).slice(0, 4000) });
      return;
    }
    if (fileKind(file) === "bild") {
      setPreview({ id: file.id, url: URL.createObjectURL(blob) });
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 px-4 py-4">
      <p className="text-sm text-mist">{status}</p>
      <label
        className="flex h-28 cursor-pointer items-center justify-center rounded-2xl border border-dashed border-line bg-panel px-4 text-center text-sm text-paper"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void take(event.dataTransfer.files);
        }}
      >
        Datei hier ablegen
        <input
          type="file"
          className="sr-only"
          onChange={(event) => {
            void take(event.target.files);
            event.target.value = "";
          }}
        />
      </label>
      {files.length === 0 ? <p className="text-sm text-mist">Noch keine Datei.</p> : null}
      {files.map((file) => (
        <article key={file.id} className="rounded-2xl border border-line bg-panel p-4">
          <p className="text-xs text-mist">
            {fileKind(file)} · {sizeLabel(file.size)}
          </p>
          <h3 className="mt-1 truncate font-display text-2xl text-paper">{file.name}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void open(file)} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
              Öffnen
            </button>
            <button type="button" onClick={() => addNote(`Datei ${file.name}`.slice(0, 180))} className="h-10 rounded-full border border-line px-3 text-sm text-paper">
              Auf den Tisch
            </button>
            <button type="button" onClick={() => void forgetFile(file.id)} className="h-10 px-3 text-sm text-mist">
              Weg
            </button>
          </div>
          {preview?.id === file.id && preview.text ? <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-sm text-paper">{preview.text}</pre> : null}
          {preview?.id === file.id && preview.url ? <img src={preview.url} alt="" className="mt-3 max-h-48 w-full rounded-xl object-contain" /> : null}
        </article>
      ))}
    </div>
  );
}
