import { useCallback, useEffect, useRef, useState } from "react";
import type { Overlay, Template, LogoOverlay, TextOverlay } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Trash2, Image as ImageIcon, Type, Plus } from "lucide-react";

interface Props {
  template: Template;
  onChange: (t: Template) => void;
  previewSrc?: string; // video src for preview background
}

const ASPECT = 16 / 9;

export function TemplateEditor({ template, onChange, previewSrc }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => setStageSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const updateOverlay = useCallback(
    (id: string, patch: Partial<Overlay>) => {
      onChange({
        ...template,
        overlays: template.overlays.map((o) => (o.id === id ? ({ ...o, ...patch } as Overlay) : o)),
      });
    },
    [template, onChange]
  );

  const removeOverlay = (id: string) => {
    onChange({ ...template, overlays: template.overlays.filter((o) => o.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const addText = () => {
    const t: TextOverlay = {
      id: crypto.randomUUID(),
      type: "text",
      text: "Sua marca aqui",
      x: 5,
      y: 85,
      size: 5,
      color: "#ffffff",
      opacity: 1,
      background: true,
    };
    onChange({ ...template, overlays: [...template.overlays, t] });
    setSelectedId(t.id);
  };

  const addLogo = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const logo: LogoOverlay = {
        id: crypto.randomUUID(),
        type: "logo",
        src,
        x: 75,
        y: 5,
        width: 18,
        opacity: 1,
      };
      onChange({ ...template, overlays: [...template.overlays, logo] });
      setSelectedId(logo.id);
    };
    reader.readAsDataURL(file);
  };

  const onLogoInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) addLogo(f);
    e.target.value = "";
  };

  // Drag handling
  const dragRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent, o: Overlay) => {
    e.stopPropagation();
    setSelectedId(o.id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: o.id, startX: e.clientX, startY: e.clientY, origX: o.x, origY: o.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || stageSize.w === 0) return;
    const dx = ((e.clientX - d.startX) / stageSize.w) * 100;
    const dy = ((e.clientY - d.startY) / stageSize.h) * 100;
    const nx = Math.max(0, Math.min(95, d.origX + dx));
    const ny = Math.max(0, Math.min(95, d.origY + dy));
    updateOverlay(d.id, { x: nx, y: ny });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const selected = template.overlays.find((o) => o.id === selectedId) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* Preview stage */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input
            value={template.name}
            onChange={(e) => onChange({ ...template, name: e.target.value })}
            className="bg-surface-2 border border-border rounded-md px-3 py-2 text-sm font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
            placeholder="Nome do template"
          />
          <button
            onClick={addText}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-2 border border-border hover:border-primary/50 text-sm transition-colors"
          >
            <Type className="size-4" /> Texto
          </button>
          <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-surface-2 border border-border hover:border-primary/50 text-sm cursor-pointer transition-colors">
            <ImageIcon className="size-4" /> Logo
            <input type="file" accept="image/*" onChange={onLogoInput} className="hidden" />
          </label>
        </div>

        <div
          ref={stageRef}
          className="relative w-full bg-black rounded-lg overflow-hidden ring-1 ring-border select-none"
          style={{ aspectRatio: `${ASPECT}` }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => setSelectedId(null)}
        >
          {previewSrc ? (
            <video src={previewSrc} className="absolute inset-0 w-full h-full object-contain" muted playsInline />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
              Envie um vídeo para pré-visualizar
            </div>
          )}

          {template.overlays.map((o) => {
            const isSelected = o.id === selectedId;
            const style: React.CSSProperties = {
              position: "absolute",
              left: `${o.x}%`,
              top: `${o.y}%`,
              opacity: o.opacity,
              cursor: "move",
              touchAction: "none",
            };
            if (o.type === "logo") {
              return (
                <img
                  key={o.id}
                  src={o.src}
                  alt=""
                  draggable={false}
                  onPointerDown={(e) => onPointerDown(e, o)}
                  style={{ ...style, width: `${o.width}%`, height: "auto" }}
                  className={cn("ring-2", isSelected ? "ring-primary" : "ring-transparent hover:ring-primary/50")}
                />
              );
            }
            return (
              <div
                key={o.id}
                onPointerDown={(e) => onPointerDown(e, o)}
                style={{
                  ...style,
                  fontSize: `${(o.size / 100) * stageSize.h}px`,
                  color: o.color,
                  background: o.background ? "rgba(0,0,0,0.5)" : "transparent",
                  padding: o.background ? "0.15em 0.4em" : 0,
                  lineHeight: 1.1,
                  whiteSpace: "pre",
                  fontFamily: '"Space Grotesk", system-ui, sans-serif',
                  fontWeight: 600,
                }}
                className={cn(
                  "ring-2 rounded",
                  isSelected ? "ring-primary" : "ring-transparent hover:ring-primary/50"
                )}
              >
                {o.text || " "}
              </div>
            );
          })}
        </div>

        {/* Layer list */}
        <div className="flex flex-wrap gap-2">
          {template.overlays.length === 0 && (
            <p className="text-xs text-muted-foreground">Adicione um logo ou texto para começar.</p>
          )}
          {template.overlays.map((o) => (
            <button
              key={o.id}
              onClick={() => setSelectedId(o.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors",
                selectedId === o.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-surface-2 border-border hover:border-primary/50"
              )}
            >
              {o.type === "logo" ? <ImageIcon className="size-3" /> : <Type className="size-3" />}
              {o.type === "logo" ? "Logo" : o.text.slice(0, 16) || "Texto"}
            </button>
          ))}
        </div>
      </div>

      {/* Inspector */}
      <aside className="bg-surface rounded-lg border border-border p-4 space-y-4 h-fit">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inspector</h3>
        {!selected && (
          <p className="text-sm text-muted-foreground">
            Selecione um elemento no preview para ajustar suas propriedades.
          </p>
        )}
        {selected && selected.type === "text" && (
          <div className="space-y-3">
            <Field label="Texto">
              <textarea
                value={selected.text}
                onChange={(e) => updateOverlay(selected.id, { text: e.target.value })}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm resize-none"
                rows={2}
              />
            </Field>
            <Range label="Tamanho" value={selected.size} min={1} max={20} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { size: v })} />
            <Range label="X" value={selected.x} min={0} max={95} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { x: v })} />
            <Range label="Y" value={selected.y} min={0} max={95} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { y: v })} />
            <Range label="Opacidade" value={selected.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(v) => updateOverlay(selected.id, { opacity: v / 100 })} />
            <Field label="Cor">
              <input
                type="color"
                value={selected.color}
                onChange={(e) => updateOverlay(selected.id, { color: e.target.value })}
                className="w-full h-8 bg-surface-2 border border-border rounded cursor-pointer"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.background}
                onChange={(e) => updateOverlay(selected.id, { background: e.target.checked })}
                className="accent-primary"
              />
              Fundo escuro atrás do texto
            </label>
            <button
              onClick={() => removeOverlay(selected.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm"
            >
              <Trash2 className="size-4" /> Remover
            </button>
          </div>
        )}
        {selected && selected.type === "logo" && (
          <div className="space-y-3">
            <div className="bg-black/40 rounded p-2 flex items-center justify-center">
              <img src={selected.src} alt="" className="max-h-20 object-contain" />
            </div>
            <Range label="Largura" value={selected.width} min={2} max={80} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { width: v })} />
            <Range label="X" value={selected.x} min={0} max={95} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { x: v })} />
            <Range label="Y" value={selected.y} min={0} max={95} step={0.5} suffix="%" onChange={(v) => updateOverlay(selected.id, { y: v })} />
            <Range label="Opacidade" value={selected.opacity * 100} min={0} max={100} step={1} suffix="%" onChange={(v) => updateOverlay(selected.id, { opacity: v / 100 })} />
            <button
              onClick={() => removeOverlay(selected.id)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 text-sm"
            >
              <Trash2 className="size-4" /> Remover
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="tabular-nums text-foreground/80">
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
