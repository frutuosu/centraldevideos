import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import type { LogoOverlay, Overlay, QualityPreset, TextOverlay } from "./types";

let ffmpegInstance: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

export async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on("log", ({ message }) => onLog(message));
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    // Preload Inter font for drawtext
    const fontData = await fetchFile("/fonts/Inter.ttf");
    await ff.writeFile("inter.ttf", fontData);
    ffmpegInstance = ff;
    return ff;
  })();

  return loadingPromise;
}

/** Escape text for drawtext filter */
function escapeDrawtext(t: string): string {
  return t
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%");
}

function hexToFfmpegColor(hex: string, opacity: number): string {
  const clean = hex.replace("#", "");
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
  const inputName = `in_${Date.now()}.${(file.name.split(".").pop() || "mp4").replace(/[^\w]/g, "")}`;
  const outputName = `out_${Date.now()}.mp4`;

  await ff.writeFile(inputName, await fetchFile(file));

  const inputs: string[] = ["-i", inputName];
  const logos = opts.overlays.filter((o): o is LogoOverlay => o.type === "logo");
  const texts = opts.overlays.filter((o): o is TextOverlay => o.type === "text");

  // Write logo files & add as inputs
  for (let i = 0; i < logos.length; i++) {
    const logo = logos[i];
    const blob = await (await fetch(logo.src)).blob();
    const ext = (blob.type.split("/")[1] || "png").replace(/[^\w]/g, "");
    const name = `logo_${i}.${ext}`;
    await ff.writeFile(name, new Uint8Array(await blob.arrayBuffer()));
    inputs.push("-i", name);
  }

  // Build filter graph
  const filters: string[] = [];
  const h = qualityHeight(opts.quality);
  let lastLabel = "[0:v]";

  if (h) {
    filters.push(`[0:v]scale=-2:${h}:flags=lanczos[v0]`);
    lastLabel = "[v0]";
  }

  // Logo overlays
  logos.forEach((logo, i) => {
    const inIdx = i + 1; // input index
    const lgIn = `[${inIdx}:v]`;
    const lgOut = `[lg${i}]`;
    filters.push(
      `${lgIn}scale=iw*${(logo.width / 100).toFixed(4)}*main_w/iw:-1,format=rgba,colorchannelmixer=aa=${logo.opacity.toFixed(2)}${lgOut}`
    );
    // Simpler: scale logo to (main_w * pct/100) — use scale2ref or compute via overlay
    // The expression above is fragile because main_w isn't available in scale filter.
    // Use scale2ref instead:
    filters.pop();
    const ref = `[ref${i}]`;
    filters.push(`${lgIn}format=rgba,colorchannelmixer=aa=${logo.opacity.toFixed(2)}[lgA${i}]`);
    filters.push(`[lgA${i}]${lastLabel}scale2ref=w='main_w*${(logo.width / 100).toFixed(4)}':h='ow/mdar'[lgS${i}]${ref}`);
    const nextLabel = `[v${i + 1}]`;
    filters.push(`${ref}[lgS${i}]overlay=x='main_w*${(logo.x / 100).toFixed(4)}':y='main_h*${(logo.y / 100).toFixed(4)}'${nextLabel}`);
    lastLabel = nextLabel;
  });

  // Text overlays
  texts.forEach((t, i) => {
    const txt = escapeDrawtext(t.text || "");
    if (!txt) return;
    const color = hexToFfmpegColor(t.color || "#ffffff", t.opacity);
    const box = t.background ? `:box=1:boxcolor=0x000000@0.5:boxborderw=10` : "";
    const fontsize = `h*${(t.size / 100).toFixed(4)}`;
    const x = `w*${(t.x / 100).toFixed(4)}`;
    const y = `h*${(t.y / 100).toFixed(4)}`;
    const nextLabel = `[t${i + 1}]`;
    filters.push(
      `${lastLabel}drawtext=fontfile=inter.ttf:text='${txt}':fontsize=${fontsize}:fontcolor=${color}:x=${x}:y=${y}${box}${nextLabel}`
    );
    lastLabel = nextLabel;
  });

  const args: string[] = [...inputs];
  if (filters.length > 0) {
    args.push("-filter_complex", filters.join(";"), "-map", lastLabel, "-map", "0:a?");
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
    opts.onProgress?.(Math.min(0.99, Math.max(0, progress)));
  };
  ff.on("progress", progressHandler);

  try {
    await ff.exec(args);
  } finally {
    ff.off("progress", progressHandler);
  }

  const data = await ff.readFile(outputName);
  const blob = new Blob([data as Uint8Array], { type: "video/mp4" });

  // Cleanup
  try { await ff.deleteFile(inputName); } catch {}
  try { await ff.deleteFile(outputName); } catch {}
  for (let i = 0; i < logos.length; i++) {
    try { await ff.deleteFile(`logo_${i}.png`); } catch {}
  }

  opts.onProgress?.(1);
  return blob;
}
