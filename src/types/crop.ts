export type AspectMode = '3:4' | '9:16' | '1:1' | '4:3' | '16:9' | 'free';

export type AiEnhanceMode = 'photo' | 'anime' | 'fast';
export type AiEnhanceScale = 1 | 2 | 4;
export type StrengthLevel = 'none' | 'weak' | 'medium' | 'strong';

export interface AiEnhanceOption {
  enabled: boolean;
  mode: AiEnhanceMode;
  scale: AiEnhanceScale;
  autoSmallCrop: boolean;
  smallCropThreshold: number; // Max edge pixel threshold (e.g. 800)
  debounceMs: number; // Debounce delay in ms (e.g. 300)
  denoiseStrength: StrengthLevel;
  unsharpStrength: StrengthLevel;
}

export interface AspectPreset {
  mode: AspectMode;
  label: string;
  ratio?: number; // width / height, e.g., 16/9 for 16:9. Undefined for 'free'
  shortcut: string; // '0' to '5'
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropTaskItem {
  id: string;              // Unique UUID for UI identification
  sourcePath: string;      // Original image file path
  fileName: string;        // e.g. "photo.jpg"
  originalWidth: number;   // Original width in pixels
  originalHeight: number;  // Original height in pixels
  aspectMode: AspectMode;
  cropRect: CropRect;      // Crop coordinates in native image pixel space
  aiEnhance?: AiEnhanceOption;
  isCompleted: boolean;
}

export type ResolutionOption =
  | { type: 'original' }
  | { type: 'exact'; width: number; height: number }
  | { type: 'longEdge'; maxPixels: number };

export type FormatOption = 'keep_original' | 'png' | 'webp_lossless' | 'webp_lossy' | 'jpeg';

export interface ExportSettingsPayload {
  tasks: Array<{
    id: string;
    sourcePath: string;
    outputFileName: string;
    cropRect: CropRect;
    resize: ResolutionOption;
    aiEnhance?: AiEnhanceOption;
  }>;
  destinationPath: string;
  formatOption: FormatOption;
  quality?: number;
  createZip: boolean;
  globalAiEnhance?: AiEnhanceOption;
}

export interface ExportProgressEvent {
  completed: number;
  total: number;
  currentFileName: string;
  isDone?: boolean;
  error?: string;
  actualDestinationPath?: string;
}

export type CanvasBackground = 'dark' | 'light' | 'checkerboard';

