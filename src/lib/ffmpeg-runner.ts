import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { LogoOverlay, Overlay, QualityPreset, TextOverlay } from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

const LOCAL_CORE_URL = "/ffmpeg/ffmpeg-core.js";
const WASM_ASSET_MANIFEST_URL = "/ffmpeg/ffmpeg-core.wasm.asset.json";
const REMOTE_CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
const EXEC_TIMEOUT_MS = 120_000;

// Ring buffer for recent ffmpeg log lines (useful when exec throws generic errors)
const recentLogs: string[] = [];
const MAX_LOGS = 60;

export async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => {
      recentLogs.push(message);
      if (recentLogs.length > MAX_LOGS) recentLogs.shift();
    });
    await loadCore(ff);
    // Preload font for drawtext (optional — text overlays only fail if this fails)
    try {
      const fontData = await fetchFile("/fonts/Inter.ttf");
      await ff.writeFile("inter.ttf", fontData);
    } catch (err) {
      console.warn("[ffmpeg] failed to preload font:", err);
    }
    ffmpegInstance = ff;
    return ff;
  })().catch((err) => {
    ffmpegInstance?.terminate();
    ffmpegInstance = null;
    loadingPromise = null;
    throw normalizeLoadError(err);
  });

  return loadingPromise;
}

async function loadCore(ff: FFmpeg): Promise<void> {
  try {
    await ff.load({
      coreURL: await toBlobURL(LOCAL_CORE_URL, "text/javascript"),
      wasmURL: await getLocalWasmURL(),
    });
  } catch (err) {
    console.warn("[ffmpeg] local core failed, falling back to CDN:", err);
    ff.terminate();
    const fallback = new FFmpeg();
    fallback.on("log", ({ message }) => {
      recentLogs.push(message);
      if (recentLogs.length > MAX_LOGS) recentLogs.shift();
    });
    await fallback.load({
      coreURL: await toBlobURL(`${REMOTE_CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${REMOTE_CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
  }
}

function normalizeLoadError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error("Falha ao carregar o motor de vídeo FFmpeg.");
}

async function getLocalWasmURL(): Promise<string> {
  const response = await fetch(WASM_ASSET_MANIFEST_URL);
  if (!response.ok) throw new Error("Manifesto local do FFmpeg não encontrado");
  const manifest = (await response.json()) as { url?: string };
  if (!manifest.url) throw new Error("Manifesto local do FFmpeg sem URL do Wasm");
  return new URL(manifest.url, window.location.origin).href;
}

/** Escape text for drawtext filter */
function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\u2019")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function hexToFfmpegColor(hex: string, opacity: number): string {
  const clean = (hex || "#ffffff").replace("#", "");
  return `0x${clean}@${opacity.toFixed(2)}`;
}

function qualityHeight(q: QualityPreset): number | null {
  switch (q) {
    case "720p": return 720;
    case "1080p": return 1080;
    case "2k": return 1440;
    case "4k": return 2160;
    default: return null;
  }
}

export interface ProcessOptions {
  overlays: Overlay[];
  quality: QualityPreset;
  onProgress?: (p: number) => void;
}

export async function processVideo(file: File, opts: ProcessOptions): Promise<Blob> {
  const ff = await getFFmpeg();

  const safeExt = (file.name.split(".").pop() || "mp4").replace(/[^\w]/g, "").slice(0, 5) || "mp4";
  const stamp = Date.now() + "_" + Math.floor(Math.random() * 1e6);
  const inputName = `in_${stamp}.${safeExt}`;
  const outputName = `out_${stamp}.mp4`;

  await ff.writeFile(inputName, await fetchFile(file));

  const logos = opts.overlays.filter((o): o is LogoOverlay => o.type === "logo" && !!o.src);
  const texts = opts.overlays.filter(
    (o): o is TextOverlay => o.type === "text" && !!(o.text && o.text.trim())
  );

  const inputArgs: string[] = ["-i", inputName];
  const logoFiles: string[] = [];

  // Write logo files & add as inputs
  for (let i = 0; i < logos.length; i++) {
    const logo = logos[i];
    try {
      const resp = await fetch(logo.src);
      const blob = await resp.blob();
      const mimeExt = (blob.type.split("/")[1] || "png").replace(/[^\w]/g, "").slice(0, 4) || "png";
      const name = `logo_${i}_${stamp}.${mimeExt}`;
      await ff.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
      inputArgs.push("-i", name);
      logoFiles.push(name);
    } catch (err) {
      console.warn("[ffmpeg] skipping logo, could not read src:", err);
    }
  }

  const usableLogos = logos.slice(0, logoFiles.length);

  // Build filter graph
  const filters: string[] = [];
  const h = qualityHeight(opts.quality);
  let lastLabel = "0:v";

  if (h) {
    // Ensure even dimensions for yuv420p
    filters.push(`[${lastLabel}]scale=-2:${h}:flags=lanczos,format=yuv420p[vbase]`);
    lastLabel = "vbase";
  }

  // Logo overlays via scale2ref (main is the video, ref is the video too)
  usableLogos.forEach((logo, i) => {
    const logoIn = `${i + 1}:v`;
    const widthPct = Math.max(0.01, Math.min(1, logo.width / 100));
    const opacity = Math.max(0, Math.min(1, logo.opacity));
    const xPct = Math.max(0, Math.min(1, logo.x / 100));
    const yPct = Math.max(0, Math.min(1, logo.y / 100));

    // Apply opacity to logo
    filters.push(`[${logoIn}]format=rgba,colorchannelmixer=aa=${opacity.toFixed(3)}[lgA${i}]`);
    // Scale logo relative to the main video using scale2ref
    // scale2ref: [in][ref] => [out_scaled][ref_pass]
    filters.push(
      `[lgA${i}][${lastLabel}]scale2ref=w='main_w*${widthPct.toFixed(4)}':h='ow/mdar'[lgS${i}][vref${i}]`
    );
    const nextLabel = `vo${i}`;
    filters.push(
      `[vref${i}][lgS${i}]overlay=x='(W-w)*${xPct.toFixed(4)}':y='(H-h)*${yPct.toFixed(4)}':format=auto[${nextLabel}]`
    );
    lastLabel = nextLabel;
  });

  // Text overlays
  texts.forEach((t, i) => {
    const txt = escapeDrawtext(t.text);
    const color = hexToFfmpegColor(t.color, t.opacity);
    const box = t.background ? `:box=1:boxcolor=0x000000@0.5:boxborderw=10` : "";
    const size = Math.max(0.01, Math.min(1, t.size / 100));
    const xPct = Math.max(0, Math.min(1, t.x / 100));
    const yPct = Math.max(0, Math.min(1, t.y / 100));
    const nextLabel = `vt${i}`;
    filters.push(
      `[${lastLabel}]drawtext=fontfile=inter.ttf:text='${txt}':fontsize='h*${size.toFixed(4)}':fontcolor=${color}:x='(w-text_w)*${xPct.toFixed(4)}':y='(h-text_h)*${yPct.toFixed(4)}'${box}[${nextLabel}]`
    );
    lastLabel = nextLabel;
  });

  const args: string[] = [...inputArgs];
  if (filters.length > 0) {
    args.push("-filter_complex", filters.join(";"), "-map", `[${lastLabel}]`, "-map", "0:a?");
  } else {
    args.push("-map", "0:v", "-map", "0:a?");
  }
  args.push(
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    outputName
  );

  const progressHandler = ({ progress }: { progress: number }) => {
    if (Number.isFinite(progress)) {
      opts.onProgress?.(Math.min(0.99, Math.max(0, progress)));
    }
  };
  ff.on("progress", progressHandler);

  // Snapshot log length so we can grab lines from this run only
  const logStart = recentLogs.length;
  let exitCode: number | undefined;
  try {
    exitCode = await ff.exec(args, EXEC_TIMEOUT_MS);
  } catch (err) {
    const tail = recentLogs.slice(Math.max(0, logStart - 5)).join("\n");
    console.error("[ffmpeg] exec threw:", err, "\nargs:", args, "\nlogs:\n", tail);
    resetFFmpeg();
    throw new Error(extractFfmpegError(tail) || normalizeExecError(err));
  } finally {
    ff.off("progress", progressHandler);
  }

  if (typeof exitCode === "number" && exitCode !== 0) {
    const tail = recentLogs.slice(Math.max(0, logStart - 5)).join("\n");
    console.error("[ffmpeg] non-zero exit:", exitCode, "\nargs:", args, "\nlogs:\n", tail);
    if (exitCode === 1) resetFFmpeg();
    throw new Error(extractFfmpegError(tail) || `FFmpeg saiu com código ${exitCode}`);
  }

  const data = await ff.readFile(outputName);
  const u8 = data as Uint8Array;
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  const blob = new Blob([buf], { type: "video/mp4" });

  // Cleanup
  try { await ff.deleteFile(inputName); } catch {}
  try { await ff.deleteFile(outputName); } catch {}
  for (const name of logoFiles) {
    try { await ff.deleteFile(name); } catch {}
  }

  opts.onProgress?.(1);
  return blob;
}

function resetFFmpeg(): void {
  ffmpegInstance?.terminate();
  ffmpegInstance = null;
  loadingPromise = null;
}

function normalizeExecError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "O processamento demorou demais e foi interrompido. Tente qualidade Original/720p ou um vídeo menor.";
  }
  if (typeof err === "string" && err.includes("timeout")) {
    return "O processamento excedeu o tempo limite. Tente qualidade Original/720p ou um vídeo menor.";
  }
  return err instanceof Error ? err.message : "Falha ao processar vídeo";
}

function extractFfmpegError(logs: string): string | null {
  if (!logs) return null;
  const lines = logs.split("\n").filter(Boolean);
  // Look for the last obviously-error-ish line
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (/error|invalid|failed|no such|unable/i.test(l)) {
      return l.trim().slice(0, 240);
    }
  }
  return lines.slice(-2).join(" | ").slice(0, 240) || null;
}
