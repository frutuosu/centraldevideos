import type { LogoOverlay, Overlay, QualityPreset, TextOverlay } from "./types";

interface RenderOptions {
  overlays: Overlay[];
  quality: QualityPreset;
  onProgress?: (p: number) => void;
}

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export async function renderVideoInBrowser(file: File, opts: RenderOptions): Promise<Blob> {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("Renderização nativa indisponível neste navegador.");
  }

  const mimeType = MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime));
  if (!mimeType) throw new Error("Este navegador não suporta gravação local de vídeo.");

  const sourceUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.preload = "auto";
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  try {
    await waitForMetadata(video);
    const { width, height } = outputSize(video, opts.quality);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Não foi possível iniciar o canvas de renderização.");

    const logos = await loadLogos(opts.overlays);
    const stream = canvas.captureStream(30);
    copyAudioTracks(video, stream);

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrateFor(width, height) });
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const stopped = new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error("Falha ao gravar o vídeo renderizado."));
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    });

    await seek(video, 0);
    recorder.start(250);
    const drawing = drawUntilEnded(video, ctx, width, height, opts.overlays, logos, opts.onProgress);
    await playVideo(video);
    await drawing;
    if (recorder.state !== "inactive") recorder.stop();

    const blob = await stopped;
    opts.onProgress?.(1);
    return blob;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(sourceUrl);
  }
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration) && video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("O navegador não conseguiu ler este vídeo."));
  });
}

function outputSize(video: HTMLVideoElement, quality: QualityPreset): { width: number; height: number } {
  const sourceWidth = video.videoWidth || 1280;
  const sourceHeight = video.videoHeight || 720;
  const targetHeight = qualityHeight(quality) ?? sourceHeight;
  const height = even(targetHeight);
  const width = even((sourceWidth / sourceHeight) * height);
  return { width, height };
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

function even(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

async function loadLogos(overlays: Overlay[]): Promise<Map<string, HTMLImageElement>> {
  const logos = overlays.filter((overlay): overlay is LogoOverlay => overlay.type === "logo" && !!overlay.src);
  const loaded = await Promise.all(
    logos.map(async (logo) => [logo.id, await loadImage(logo.src)] as const).map((promise) => promise.catch(() => null))
  );
  return new Map(loaded.filter((entry): entry is readonly [string, HTMLImageElement] => Boolean(entry)));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível carregar a logo."));
    img.src = src;
  });
}

function copyAudioTracks(video: HTMLVideoElement, stream: MediaStream): void {
  const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream
    ?? (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
  if (!capture) return;
  try {
    capture.call(video).getAudioTracks().forEach((track) => stream.addTrack(track));
  } catch {
    // Video-only output is still useful when the browser blocks audio capture.
  }
}

function bitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 3840 * 2160) return 18_000_000;
  if (pixels >= 2560 * 1440) return 12_000_000;
  if (pixels >= 1920 * 1080) return 8_000_000;
  return 4_000_000;
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 0.01) return Promise.resolve();
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("Falha ao preparar o vídeo para renderização."));
    video.currentTime = time;
  });
}

async function playVideo(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }
}

function drawUntilEnded(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlays: Overlay[],
  logos: Map<string, HTMLImageElement>,
  onProgress?: (p: number) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const draw = () => {
      ctx.drawImage(video, 0, 0, width, height);
      drawOverlays(ctx, width, height, overlays, logos);

      if (Number.isFinite(video.duration) && video.duration > 0) {
        onProgress?.(Math.min(0.99, Math.max(0, video.currentTime / video.duration)));
      }

      if (video.ended) {
        resolve();
        return;
      }
      requestAnimationFrame(draw);
    };
    draw();
  });
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlays: Overlay[],
  logos: Map<string, HTMLImageElement>,
): void {
  for (const overlay of overlays) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity));
    if (overlay.type === "logo") drawLogo(ctx, width, height, overlay, logos.get(overlay.id));
    else drawText(ctx, width, height, overlay);
    ctx.restore();
  }
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  overlay: LogoOverlay,
  image?: HTMLImageElement,
): void {
  if (!image) return;
  const logoWidth = width * Math.max(0.01, overlay.width / 100);
  const logoHeight = logoWidth * (image.naturalHeight / image.naturalWidth || 1);
  ctx.drawImage(image, (overlay.x / 100) * width, (overlay.y / 100) * height, logoWidth, logoHeight);
}

function drawText(ctx: CanvasRenderingContext2D, width: number, height: number, overlay: TextOverlay): void {
  const fontSize = Math.max(8, height * Math.max(0.01, overlay.size / 100));
  const x = (overlay.x / 100) * width;
  const y = (overlay.y / 100) * height;
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textBaseline = "top";
  const lines = overlay.text.split("\n");
  const lineHeight = fontSize * 1.15;

  if (overlay.background) {
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line || " ").width));
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(x - fontSize * 0.25, y - fontSize * 0.15, textWidth + fontSize * 0.5, lineHeight * lines.length + fontSize * 0.3);
  }

  ctx.fillStyle = overlay.color || "#ffffff";
  lines.forEach((line, index) => ctx.fillText(line || " ", x, y + index * lineHeight));
}
