import { create } from 'zustand';
import { AspectMode, CanvasBackground, CropRect, CropTaskItem } from '../types/crop';
import { getPresetByMode } from '../utils/presets';

interface CropState {
  tasks: CropTaskItem[];
  activeTaskIndex: number;
  canvasBg: CanvasBackground;
  showGrid: boolean;
  activeAspectMode: AspectMode;
  isSidebarOpen: boolean;
  lastCropSizes: Partial<Record<AspectMode, { width: number; height: number }>>;

  // Actions
  addTasks: (items: Array<{ sourcePath: string; fileName: string; originalWidth: number; originalHeight: number }>) => void;
  setActiveTaskIndex: (index: number) => void;
  updateCurrentCropRect: (rect: CropRect) => void;
  setAspectMode: (mode: AspectMode) => void;
  duplicateCurrentTask: () => void;
  nextTask: () => void;
  prevTask: () => void;
  toggleGrid: () => void;
  toggleSidebar: () => void;
  cycleCanvasBg: () => void;
  removeTask: (id: string) => void;
  clearAllTasks: () => void;
  resetAllTaskCompletions: () => void;
  getExportTasksPayload: () => Array<{
    id: string;
    sourcePath: string;
    outputFileName: string;
    cropRect: CropRect;
  }>;
}

// Helper to compute initial crop rect centered inside original image bounds
export const calculateInitialCropRect = (
  originalW: number,
  originalH: number,
  mode: AspectMode
): CropRect => {
  const preset = getPresetByMode(mode);
  if (mode === 'free' || !preset.ratio) {
    // Default Free crop: 80% of width/height centered
    const w = Math.round(originalW * 0.8);
    const h = Math.round(originalH * 0.8);
    const x = Math.round((originalW - w) / 2);
    const y = Math.round((originalH - h) / 2);
    return { x, y, width: w, height: h };
  }

  const ratio = preset.ratio;
  let targetW = originalW;
  let targetH = Math.round(originalW / ratio);

  if (targetH > originalH) {
    targetH = originalH;
    targetW = Math.round(originalH * ratio);
  }

  // Scale down to 80% for nice margin
  targetW = Math.round(targetW * 0.8);
  targetH = Math.round(targetH * 0.8);

  const x = Math.round((originalW - targetW) / 2);
  const y = Math.round((originalH - targetH) / 2);

  return {
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: Math.min(originalW, targetW),
    height: Math.min(originalH, targetH),
  };
};

// Helper to compute crop rect carrying over last specified width & height if available
export const calculateCropRectForTask = (
  originalW: number,
  originalH: number,
  mode: AspectMode,
  lastCropSize?: { width: number; height: number },
  currentRect?: CropRect
): CropRect => {
  if (!lastCropSize) {
    return calculateInitialCropRect(originalW, originalH, mode);
  }

  const preset = getPresetByMode(mode);
  const ratio = preset.ratio;

  let w = lastCropSize.width;
  let h = lastCropSize.height;

  if (ratio) {
    h = Math.round(w / ratio);
    if (w > originalW || h > originalH) {
      const scaleW = originalW / w;
      const scaleH = originalH / h;
      const s = Math.min(scaleW, scaleH);
      w = Math.max(1, Math.round(w * s));
      h = Math.max(1, Math.round(h * s));
    }
  } else {
    w = Math.max(1, Math.min(originalW, w));
    h = Math.max(1, Math.min(originalH, h));
  }

  let x: number;
  let y: number;

  if (currentRect) {
    const centerX = currentRect.x + currentRect.width / 2;
    const centerY = currentRect.y + currentRect.height / 2;
    x = Math.round(centerX - w / 2);
    y = Math.round(centerY - h / 2);
  } else {
    x = Math.round((originalW - w) / 2);
    y = Math.round((originalH - h) / 2);
  }

  x = Math.max(0, Math.min(originalW - w, x));
  y = Math.max(0, Math.min(originalH - h, y));

  return { x, y, width: w, height: h };
};

export const useCropStore = create<CropState>((set, get) => ({
  tasks: [],
  activeTaskIndex: 0,
  canvasBg: 'dark',
  showGrid: true,
  activeAspectMode: '16:9',
  isSidebarOpen: true,
  lastCropSizes: {},

  addTasks: (items) => {
    const state = get();
    const currentMode = state.activeAspectMode;
    const lastSize = state.lastCropSizes[currentMode];

    const newTasks: CropTaskItem[] = items.map((item) => ({
      id: crypto.randomUUID(),
      sourcePath: item.sourcePath,
      fileName: item.fileName,
      originalWidth: item.originalWidth,
      originalHeight: item.originalHeight,
      aspectMode: currentMode,
      cropRect: calculateCropRectForTask(item.originalWidth, item.originalHeight, currentMode, lastSize),
      isCompleted: false,
    }));

    set((s) => {
      const updatedTasks = [...s.tasks, ...newTasks];
      return {
        tasks: updatedTasks,
        activeTaskIndex: s.tasks.length === 0 ? 0 : s.activeTaskIndex,
      };
    });
  },

  setActiveTaskIndex: (index) => {
    const { tasks } = get();
    if (tasks.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(tasks.length - 1, index));
    const targetTask = tasks[clampedIndex];

    set({
      activeTaskIndex: clampedIndex,
      activeAspectMode: targetTask.aspectMode,
    });
  },

  updateCurrentCropRect: (rect) => {
    const { tasks, activeTaskIndex, lastCropSizes } = get();
    if (tasks.length === 0 || activeTaskIndex < 0 || activeTaskIndex >= tasks.length) return;

    const currentTask = tasks[activeTaskIndex];
    // Ensure rect is strictly bounded within image dimensions
    const clampedX = Math.max(0, Math.min(currentTask.originalWidth - 1, rect.x));
    const clampedY = Math.max(0, Math.min(currentTask.originalHeight - 1, rect.y));
    const clampedW = Math.max(1, Math.min(currentTask.originalWidth - clampedX, rect.width));
    const clampedH = Math.max(1, Math.min(currentTask.originalHeight - clampedY, rect.height));

    const updatedTasks = [...tasks];
    updatedTasks[activeTaskIndex] = {
      ...currentTask,
      cropRect: { x: clampedX, y: clampedY, width: clampedW, height: clampedH },
    };

    set({
      tasks: updatedTasks,
      lastCropSizes: {
        ...lastCropSizes,
        [currentTask.aspectMode]: { width: clampedW, height: clampedH },
      },
    });
  },

  setAspectMode: (mode) => {
    const { tasks, activeTaskIndex, lastCropSizes } = get();
    set({ activeAspectMode: mode });

    if (tasks.length === 0 || activeTaskIndex < 0 || activeTaskIndex >= tasks.length) return;

    const currentTask = tasks[activeTaskIndex];
    const lastSize = lastCropSizes[mode];
    const newRect = calculateCropRectForTask(
      currentTask.originalWidth,
      currentTask.originalHeight,
      mode,
      lastSize
    );

    const updatedTasks = [...tasks];
    updatedTasks[activeTaskIndex] = {
      ...currentTask,
      aspectMode: mode,
      cropRect: newRect,
      isCompleted: false, // Reset completed flag if aspect mode changes
    };

    set({ tasks: updatedTasks });
  },

  duplicateCurrentTask: () => {
    const { tasks, activeTaskIndex } = get();
    if (tasks.length === 0 || activeTaskIndex < 0 || activeTaskIndex >= tasks.length) return;

    const currentTask = tasks[activeTaskIndex];
    const duplicatedTask: CropTaskItem = {
      ...currentTask,
      id: crypto.randomUUID(),
      isCompleted: false,
      cropRect: { ...currentTask.cropRect },
    };

    // Mark current task as completed
    const updatedTasks = [...tasks];
    updatedTasks[activeTaskIndex] = {
      ...currentTask,
      isCompleted: true,
    };

    // Insert duplicate DIRECTLY after current task index
    const insertIndex = activeTaskIndex + 1;
    updatedTasks.splice(insertIndex, 0, duplicatedTask);

    set({
      tasks: updatedTasks,
      activeTaskIndex: insertIndex,
    });
  },

  nextTask: () => {
    const { tasks, activeTaskIndex, lastCropSizes } = get();
    if (tasks.length === 0) return;

    const currentTask = tasks[activeTaskIndex];
    const currentMode = currentTask.aspectMode;
    const currentRect = currentTask.cropRect;

    const updatedTasks = [...tasks];
    // Re-define & re-confirm current task completion with current cropRect
    updatedTasks[activeTaskIndex] = {
      ...currentTask,
      isCompleted: true,
    };

    const updatedLastSizes = {
      ...lastCropSizes,
      [currentMode]: { width: currentRect.width, height: currentRect.height },
    };

    const nextIndex = Math.min(tasks.length - 1, activeTaskIndex + 1);
    const nextTaskItem = updatedTasks[nextIndex];

    // Carry over updated lastSize ONLY if the next task is NOT completed yet
    if (nextTaskItem && nextIndex !== activeTaskIndex && !nextTaskItem.isCompleted) {
      const mode = nextTaskItem.aspectMode;
      const lastSize = updatedLastSizes[mode];
      if (lastSize) {
        updatedTasks[nextIndex] = {
          ...nextTaskItem,
          cropRect: calculateCropRectForTask(
            nextTaskItem.originalWidth,
            nextTaskItem.originalHeight,
            mode,
            lastSize
          ),
        };
      }
    }

    set({
      tasks: updatedTasks,
      activeTaskIndex: nextIndex,
      activeAspectMode: nextTaskItem ? nextTaskItem.aspectMode : get().activeAspectMode,
      lastCropSizes: updatedLastSizes,
    });
  },

  prevTask: () => {
    const { tasks, activeTaskIndex } = get();
    if (tasks.length === 0 || activeTaskIndex <= 0) return;

    const prevIndex = activeTaskIndex - 1;
    const prevTaskItem = tasks[prevIndex];

    set({
      activeTaskIndex: prevIndex,
      activeAspectMode: prevTaskItem.aspectMode,
    });
  },

  toggleGrid: () => {
    set((s) => ({ showGrid: !s.showGrid }));
  },

  toggleSidebar: () => {
    set((s) => ({ isSidebarOpen: !s.isSidebarOpen }));
  },

  cycleCanvasBg: () => {
    set((s) => {
      const nextBg: Record<CanvasBackground, CanvasBackground> = {
        dark: 'light',
        light: 'checkerboard',
        checkerboard: 'dark',
      };
      return { canvasBg: nextBg[s.canvasBg] };
    });
  },

  removeTask: (id) => {
    set((s) => {
      const newTasks = s.tasks.filter((t) => t.id !== id);
      const newIndex = Math.min(s.activeTaskIndex, Math.max(0, newTasks.length - 1));
      return {
        tasks: newTasks,
        activeTaskIndex: newIndex,
      };
    });
  },

  clearAllTasks: () => {
    set({ tasks: [], activeTaskIndex: 0 });
  },

  resetAllTaskCompletions: () => {
    set((s) => ({
      tasks: s.tasks.map((task) => ({ ...task, isCompleted: false })),
    }));
  },

  getExportTasksPayload: () => {
    const { tasks } = get();

    // Group tasks by sourcePath to determine numbering
    const pathMap = new Map<string, CropTaskItem[]>();
    tasks.forEach((task) => {
      const list = pathMap.get(task.sourcePath) || [];
      list.push(task);
      pathMap.set(task.sourcePath, list);
    });

    return tasks.map((task) => {
      const samePathTasks = pathMap.get(task.sourcePath) || [];
      const isMultiple = samePathTasks.length > 1;
      const indexInGroup = samePathTasks.findIndex((t) => t.id === task.id);

      // Split filename and extension
      const lastDotIndex = task.fileName.lastIndexOf('.');
      const baseName = lastDotIndex !== -1 ? task.fileName.substring(0, lastDotIndex) : task.fileName;
      const ext = lastDotIndex !== -1 ? task.fileName.substring(lastDotIndex) : '';

      const outputFileName = isMultiple
        ? `${baseName}_crop_${indexInGroup + 1}${ext}`
        : `${baseName}_crop${ext}`;

      return {
        id: task.id,
        sourcePath: task.sourcePath,
        outputFileName,
        cropRect: task.cropRect,
      };
    });
  },
}));
