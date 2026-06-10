import { Plus, Copy, Trash2, FileVideo } from "lucide-react";
import type { Template } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  templates: Template[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateLibrary({ templates, activeId, onSelect, onNew, onDuplicate, onDelete }: Props) {
  return (
    <div className="bg-surface rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Biblioteca</h3>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground font-medium hover:opacity-90"
        >
          <Plus className="size-3" /> Novo
        </button>
      </div>
      <div className="space-y-1.5 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
        {templates.length === 0 && (
          <p className="text-xs text-muted-foreground py-4 text-center">Nenhum template salvo ainda.</p>
        )}
        {templates.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group rounded-md border px-2.5 py-2 cursor-pointer transition-colors",
              activeId === t.id
                ? "border-primary bg-primary/10"
                : "border-border bg-surface-2 hover:border-primary/40"
            )}
            onClick={() => onSelect(t.id)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{t.name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <FileVideo className="size-3" />
                  {t.overlays.length} elemento{t.overlays.length === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(t.id);
                  }}
                  className="p-1 rounded hover:bg-surface text-muted-foreground hover:text-foreground"
                  title="Duplicar"
                >
                  <Copy className="size-3.5" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Excluir "${t.name}"?`)) onDelete(t.id);
                  }}
                  className="p-1 rounded hover:bg-surface text-muted-foreground hover:text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
