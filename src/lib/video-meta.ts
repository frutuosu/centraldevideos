export async function probeVideo(file: File): Promise<{ duration: number; thumbnail: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Falha ao ler vídeo"));
  });
  video.currentTime = Math.min(0.5, video.duration / 2);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });
  const canvas = document.createElement("canvas");
  const w = video.videoWidth;
  const h = video.videoHeight;
  const ratio = w / h;
  canvas.width = 320;
  canvas.height = Math.round(320 / ratio);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
  const duration = video.duration;
  URL.revokeObjectURL(url);
  return { duration, thumbnail, width: w, height: h };
}
