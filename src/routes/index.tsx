import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Film, Sparkles } from "lucide-react";
import { Dropzone } from "@/components/Dropzone";
import { TemplateEditor } from "@/components/TemplateEditor";
import { TemplateLibrary } from "@/components/TemplateLibrary";
import { ProcessPanel } from "@/components/ProcessPanel";
import {
  deleteTemplate,
  duplicateTemplate,
  loadTemplates,
  newTemplate,
  upsertTemplate,
} from "@/lib/templates-store";
import type { Template, VideoItem } from "@/lib/types";
import { probeVideo } from "@/lib/video-meta";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VBatch — Edição em massa de vídeos com template" },
      {
        name: "description",
        content:
          "Aplique um único template em centenas de vídeos. Processamento 100% local no navegador, sem upload.",
      },
      { property: "og:title", content: "VBatch — Edição em massa de vídeos" },
      {
        property: "og:description",
        content: "Logo, texto, marca d'água em lote. Tudo local, nada vai pra nuvem.",
      },
    ],
  }),
  component: App,
});

function App() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VideoItem[]>([]);

  // Load templates on mount
  useEffect(() => {
    const list = loadTemplates();
    if (list.length === 0) {
      const t = newTemplate("Meu primeiro template");
      upsertTemplate(t);
      setTemplates([t]);
      setActiveId(t.id);
    } else {
      setTemplates(list);
      setActiveId(list[0].id);
    }
  }, []);

  const active = useMemo(() => templates.find((t) => t.id === activeId) || null, [templates, activeId]);

  const updateActive = (t: Template) => {
    const saved = upsertTemplate(t);
    setTemplates((list) => list.map((x) => (x.id === saved.id ? saved : x)));
  };

  const createTemplate = () => {
    const t = newTemplate(`Template ${templates.length + 1}`);
    upsertTemplate(t);
    setTemplates((list) => [...list, t]);
    setActiveId(t.id);
  };

  const handleDelete = (id: string) => {
    deleteTemplate(id);
    setTemplates((list) => {
      const next = list.filter((x) => x.id !== id);
      if (activeId === id) setActiveId(next[0]?.id ?? null);
      return next;
    });
  };

  const handleDuplicate = (id: string) => {
    const copy = duplicateTemplate(id);
    if (copy) {
      setTemplates((list) => [...list, copy]);
      setActiveId(copy.id);
    }
  };

  const addVideos = async (files: File[]) => {
    const items: VideoItem[] = files.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      name: f.name,
      size: f.size,
      status: "idle" as const,
      progress: 0,
    }));
    setVideos((list) => [...list, ...items]);

    // Probe in background
    for (const item of items) {
      try {
        const meta = await probeVideo(item.file);
        setVideos((list) =>
          list.map((v) =>
            v.id === item.id ? { ...v, duration: meta.duration, thumbnail: meta.thumbnail } : v
          )
        );
      } catch {
        // ignore
      }
    }
  };

  const previewSrc = useMemo(() => {
    const first = videos[0];
    if (!first) return undefined;
    return URL.createObjectURL(first.file);
  }, [videos[0]?.id]);

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-surface/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold">
            <Film className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg font-bold leading-tight">VBatch</h1>
            <p className="text-[11px] text-muted-foreground leading-tight">
              Edição em massa · processamento 100% local
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-full border border-border">
            <Sparkles className="size-3 text-primary" />
            FFmpeg.wasm
          </span>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <TemplateLibrary
          templates={templates}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={createTemplate}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
        />

        <div className="space-y-8 min-w-0">
          <Section title="1. Envie seus vídeos" subtitle="Selecione múltiplos arquivos. Eles ficam só na sua máquina.">
            <Dropzone onFiles={addVideos} />
          </Section>

          <Section
            title="2. Configure o template"
            subtitle="Posicione logo, texto e marca d'água arrastando no preview. Salvo automaticamente."
          >
            {active ? (
              <TemplateEditor template={active} onChange={updateActive} previewSrc={previewSrc} />
            ) : (
              <p className="text-sm text-muted-foreground">Crie um template na biblioteca.</p>
            )}
          </Section>

          <Section
            title="3. Processe e baixe"
            subtitle="O template é aplicado em todos os vídeos da fila. Baixe individual ou em ZIP."
          >
            <ProcessPanel
              videos={videos}
              setVideos={setVideos}
              overlays={active?.overlays ?? []}
              disabled={!active}
            />
          </Section>

          <footer className="text-center text-xs text-muted-foreground pt-4 pb-8">
            Processamento via FFmpeg WebAssembly · vídeos longos podem demorar · funciona melhor no Chrome/Edge
          </footer>
        </div>
      </div>
    </main>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}
