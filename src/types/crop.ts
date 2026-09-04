export type AspectMode = 'free' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

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
  }>;
  destinationPath: string;
  formatOption: FormatOption;
  quality?: number;
  createZip: boolean;
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
