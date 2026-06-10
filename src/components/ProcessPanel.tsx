import { useState } from "react";
import JSZip from "jszip";
import { Play, Download, Trash2, Loader2, CheckCircle2, AlertCircle, Package } from "lucide-react";
import type { Overlay, QualityPreset, VideoItem } from "@/lib/types";
import { processVideo } from "@/lib/ffmpeg-runner";
import { formatBytes, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  videos: VideoItem[];
  setVideos: React.Dispatch<React.SetStateAction<VideoItem[]>>;
  overlays: Overlay[];
  disabled?: boolean;
}

const QUALITIES: { value: QualityPreset; label: string }[] = [
  { value: "source", label: "Original" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
];

export function ProcessPanel({ videos, setVideos, overlays, disabled }: Props) {
  const [quality, setQuality] = useState<QualityPreset>("1080p");
  const [running, setRunning] = useState(false);

  const updateVideo = (id: string, patch: Partial<VideoItem>) => {
    setVideos((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const processAll = async () => {
    if (running) return;
    setRunning(true);
    // Mark queued
    setVideos((list) =>
      list.map((v) =>
        v.status === "done" ? v : { ...v, status: "queued", progress: 0, error: undefined }
      )
    );

    // Sequential to keep memory low
    const queue = videos.filter((v) => v.status !== "done");
    for (const v of queue) {
      updateVideo(v.id, { status: "processing", progress: 0 });
      try {
        const blob = await processVideo(v.file, {
          overlays,
          quality,
          onProgress: (p) => updateVideo(v.id, { progress: p }),
        });
        const url = URL.createObjectURL(blob);
        updateVideo(v.id, { status: "done", progress: 1, resultBlob: blob, resultUrl: url });
      } catch (err) {
        console.error(err);
        updateVideo(v.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }
    setRunning(false);
  };

  const downloadOne = (v: VideoItem) => {
    if (!v.resultUrl) return;
    const a = document.createElement("a");
    a.href = v.resultUrl;
    a.download = v.name.replace(/\.[^.]+$/, "") + "_editado.mp4";
    a.click();
  };

  const downloadZip = async () => {
    const done = videos.filter((v) => v.status === "done" && v.resultBlob);
    if (!done.length) return;
    const zip = new JSZip();
    for (const v of done) {
      zip.file(v.name.replace(/\.[^.]+$/, "") + "_editado.mp4", v.resultBlob!);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `videos_editados_${Date.now()}.zip`;
    a.click();
  };

  const remove = (id: string) => {
    setVideos((list) => {
      const v = list.find((x) => x.id === id);
      if (v?.resultUrl) URL.revokeObjectURL(v.resultUrl);
      return list.filter((x) => x.id !== id);
    });
  };

  const doneCount = videos.filter((v) => v.status === "done").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 bg-surface rounded-lg border border-border p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground uppercase">Qualidade</span>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as QualityPreset)}
            disabled={running}
            className="bg-surface-2 border border-border rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {QUALITIES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1" />
        <button
          onClick={processAll}
          disabled={disabled || running || videos.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {running ? "Processando..." : "Processar todos"}
        </button>
        <button
          onClick={downloadZip}
          disabled={doneCount === 0}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface-2 text-sm hover:border-primary/50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Package className="size-4" /> ZIP ({doneCount})
        </button>
      </div>

      <div className="space-y-2">
        {videos.map((v) => (
          <div key={v.id} className="flex items-center gap-3 bg-surface border border-border rounded-lg p-3">
            <div className="w-24 aspect-video rounded bg-black overflow-hidden flex-shrink-0">
              {v.thumbnail ? (
                <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full grid place-items-center text-muted-foreground text-xs">
                  ...
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{v.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(v.size)} · {formatDuration(v.duration)}
              </p>
              {(v.status === "processing" || v.status === "queued") && (
                <div className="mt-2 h-1.5 bg-surface-2 rounded overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round(v.progress * 100)}%` }}
                  />
                </div>
              )}
              {v.status === "error" && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="size-3" /> {v.error}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={v.status} progress={v.progress} />
              {v.status === "done" && (
                <button
                  onClick={() => downloadOne(v)}
                  className="p-2 rounded-md bg-primary/15 text-primary hover:bg-primary/25"
                  title="Baixar"
                >
                  <Download className="size-4" />
                </button>
              )}
              <button
                onClick={() => remove(v.id)}
                disabled={v.status === "processing"}
                className="p-2 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
                title="Remover"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
        {videos.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum vídeo na fila. Envie arquivos na aba acima.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, progress }: { status: VideoItem["status"]; progress: number }) {
  if (status === "done")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <CheckCircle2 className="size-3.5" /> Pronto
      </span>
    );
  if (status === "processing")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-foreground/80 tabular-nums">
        <Loader2 className="size-3.5 animate-spin" /> {Math.round(progress * 100)}%
      </span>
    );
  if (status === "queued")
    return <span className="text-xs text-muted-foreground">Na fila</span>;
  if (status === "error")
    return <span className="text-xs text-destructive">Erro</span>;
  return <span className="text-xs text-muted-foreground">Aguardando</span>;
}
