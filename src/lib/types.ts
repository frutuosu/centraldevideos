export type QualityPreset = "source" | "720p" | "1080p" | "2k" | "4k";

export interface LogoOverlay {
  id: string;
  type: "logo";
  /** Data URL of the image (PNG/JPG) */
  src: string;
  /** Position in % of the video frame (0-100) */
  x: number;
  y: number;
  /** Width as % of video width */
  width: number;
  opacity: number; // 0-1
}

export interface TextOverlay {
  id: string;
  type: "text";
  text: string;
  x: number; // %
  y: number; // %
  /** Font size as % of video height */
  size: number;
  color: string; // hex
  opacity: number;
  background: boolean;
}

export type Overlay = LogoOverlay | TextOverlay;

export interface Template {
  id: string;
  name: string;
  overlays: Overlay[];
  createdAt: number;
  updatedAt: number;
}

export interface VideoItem {
  id: string;
  file: File;
  name: string;
  size: number;
  duration?: number;
  thumbnail?: string;
  status: "idle" | "queued" | "processing" | "done" | "error";
  progress: number;
  resultUrl?: string;
  resultBlob?: Blob;
  error?: string;
}
