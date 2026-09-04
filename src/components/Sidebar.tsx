import React, { useRef } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { useCropStore } from '../store/cropStore';
import { Plus, Trash2, CheckCircle2, Image as ImageIcon, Copy, Layers, RotateCcw } from 'lucide-react';

export const Sidebar: React.FC = () => {
  const {
    tasks,
    activeTaskIndex,
    setActiveTaskIndex,
    removeTask,
    clearAllTasks,
    resetAllTaskCompletions,
    addTasks,
    duplicateCurrentTask,
  } = useCropStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to load image file dimensions and add to store
  const processFiles = async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((file) =>
      /\.(png|jpe?g|webp|jfif|bmp)$/i.test(file.name)
    );

    if (validFiles.length === 0) return;

    for (const file of validFiles) {
      const filePath = (file as any).path || file.name;
      try {
        const info = await invoke<{ width: number; height: number; sourcePath: string; fileName: string }>(
          'load_image_info',
          { sourcePath: filePath }
        );
        addTasks([
          {
            sourcePath: info.sourcePath,
            fileName: info.fileName,
            originalWidth: info.width,
            originalHeight: info.height,
          },
        ]);
      } catch (err) {
        console.warn('Rust load_image_info fallback in Sidebar:', err);
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
          addTasks([
            {
              sourcePath: filePath,
              fileName: file.name,
              originalWidth: img.naturalWidth || 1920,
              originalHeight: img.naturalHeight || 1080,
            },
          ]);
          URL.revokeObjectURL(objectUrl);
        };

        img.src = objectUrl;
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
      e.target.value = ''; // Reset
    }
  };

  // Group payload for previewing output filenames
  const pathMap = new Map<string, typeof tasks>();
  tasks.forEach((t) => {
    const list = pathMap.get(t.sourcePath) || [];
    list.push(t);
    pathMap.set(t.sourcePath, list);
  });

  const getPreviewOutputName = (task: (typeof tasks)[0]) => {
    const samePathTasks = pathMap.get(task.sourcePath) || [];
    const isMultiple = samePathTasks.length > 1;
    const indexInGroup = samePathTasks.findIndex((t) => t.id === task.id);

    const lastDotIndex = task.fileName.lastIndexOf('.');
    const baseName = lastDotIndex !== -1 ? task.fileName.substring(0, lastDotIndex) : task.fileName;
    const ext = lastDotIndex !== -1 ? task.fileName.substring(lastDotIndex) : '';

    return isMultiple ? `${baseName}_crop_${indexInGroup + 1}${ext}` : `${baseName}_crop${ext}`;
  };

  const hasCompletedTasks = tasks.some((t) => t.isCompleted);

  return (
    <div className="w-80 h-full bg-zinc-900 border-r border-zinc-800 flex flex-col select-none">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Layers className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-sm text-zinc-100">タスクキュー</h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-800 text-zinc-400 border border-zinc-700">
            {tasks.length}
          </span>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition text-xs flex items-center font-medium"
            title="画像を追加"
          >
            <Plus className="w-4 h-4 mr-1" />
            追加
          </button>

          {tasks.length > 0 && (
            <button
              onClick={clearAllTasks}
              className="p-1.5 rounded-lg hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 transition"
              title="すべてクリア"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/bmp"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* Action shortcuts summary in sidebar */}
      {tasks.length > 0 && (
        <div className="px-3 py-2 bg-zinc-950/50 border-b border-zinc-800/60 flex items-center justify-between text-xs space-x-2">
          <button
            onClick={duplicateCurrentTask}
            className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/60 transition text-xs font-medium"
            title="現在の画像をタスクキューの直後に複製 (Shift + Space)"
          >
            <Copy className="w-3.5 h-3.5 text-emerald-400" />
            <span>直後に複製</span>
          </button>

          <button
            onClick={resetAllTaskCompletions}
            disabled={!hasCompletedTasks}
            className="flex items-center justify-center space-x-1 py-1.5 px-2.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 transition text-xs font-medium disabled:opacity-30 disabled:pointer-events-none"
            title="タスクキュー全体の確定状態（緑のチェックマーク）をすべて一括解除"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>決定リセット</span>
          </button>
        </div>
      )}

      {/* Task Item List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {tasks.length === 0 ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="h-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-800 rounded-xl hover:border-emerald-500/40 hover:bg-zinc-800/20 transition cursor-pointer group text-center"
          >
            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-emerald-400 group-hover:scale-110 transition mb-3">
              <ImageIcon className="w-6 h-6" />
            </div>
            <p className="text-xs font-medium text-zinc-300">画像をここにドロップ</p>
            <p className="text-[11px] text-zinc-500 mt-1">またはクリックしてファイルを選択</p>
          </div>
        ) : (
          tasks.map((task, index) => {
            const isActive = index === activeTaskIndex;
            const outputName = getPreviewOutputName(task);
            const thumbSrc = convertFileSrc(task.sourcePath);

            return (
              <div
                key={task.id}
                onClick={() => setActiveTaskIndex(index)}
                className={`group relative p-2.5 rounded-xl border transition cursor-pointer flex items-center space-x-3 ${
                  isActive
                    ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm'
                    : 'bg-zinc-800/40 border-zinc-800 hover:bg-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                {/* Image Thumbnail */}
                <div className="w-12 h-12 rounded-lg bg-zinc-950 overflow-hidden border border-zinc-800 flex-shrink-0 relative">
                  <img
                    src={thumbSrc}
                    alt={task.fileName}
                    className="w-full h-full object-cover"
                  />
                  {task.isCompleted && (
                    <div className="absolute inset-0 bg-emerald-950/60 backdrop-blur-[1px] flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    </div>
                  )}
                </div>

                {/* Item Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-zinc-200 truncate" title={task.fileName}>
                      {task.fileName}
                    </p>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-950 text-emerald-400 border border-emerald-500/20">
                      {task.aspectMode}
                    </span>
                  </div>

                  <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5">
                    ➔ {outputName}
                  </p>

                  <p className="text-[10px] text-zinc-500 mt-0.5">
                    {task.originalWidth} × {task.originalHeight} px
                  </p>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTask(task.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-rose-500/20 text-zinc-500 hover:text-rose-400 rounded-lg transition"
                  title="タスクを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
