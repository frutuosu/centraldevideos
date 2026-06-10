import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
}

export function Dropzone({ onFiles }: Props) {
  const [hover, setHover] = useState(false);

  const handle = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const videos = Array.from(files).filter((f) => f.type.startsWith("video/"));
      if (videos.length) onFiles(videos);
    },
    [onFiles]
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "block cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors",
        hover ? "border-primary bg-primary/5" : "border-border bg-surface/50 hover:border-primary/50"
      )}
    >
      <input
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <UploadCloud className="size-10 mx-auto text-primary mb-3" />
      <p className="font-medium">Arraste vídeos aqui ou clique para selecionar</p>
      <p className="text-xs text-muted-foreground mt-1">
        MP4, MOV, WebM • processado localmente, nada é enviado pra nuvem
      </p>
    </label>
  );
}
