import type { Template } from "./types";

const KEY = "vbatch.templates.v1";

export function loadTemplates(): Template[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Template[];
  } catch {
    return [];
  }
}

export function saveTemplates(list: Template[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function upsertTemplate(t: Template) {
  const list = loadTemplates();
  const idx = list.findIndex((x) => x.id === t.id);
  const next = { ...t, updatedAt: Date.now() };
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  saveTemplates(list);
  return next;
}

export function deleteTemplate(id: string) {
  saveTemplates(loadTemplates().filter((x) => x.id !== id));
}

export function duplicateTemplate(id: string): Template | null {
  const list = loadTemplates();
  const found = list.find((x) => x.id === id);
  if (!found) return null;
  const copy: Template = {
    ...found,
    id: crypto.randomUUID(),
    name: `${found.name} (cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  list.push(copy);
  saveTemplates(list);
  return copy;
}

export function newTemplate(name = "Novo template"): Template {
  return {
    id: crypto.randomUUID(),
    name,
    overlays: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
