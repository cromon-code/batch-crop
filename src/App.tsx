import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { CropCanvas } from './components/CropCanvas';
import { ExportModal } from './components/ExportModal';
import { useShortcuts } from './hooks/useShortcuts';
import { useCropStore } from './store/cropStore';

export const App: React.FC = () => {
  // Register keyboard shortcuts
  useShortcuts();

  const { addTasks, isSidebarOpen } = useCropStore();
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Helper to process absolute file paths dropped into Tauri app
  const processFilePaths = useCallback(
    async (paths: string[]) => {
      const validPaths = paths.filter((path) =>
        /\.(png|jpe?g|webp|jfif|bmp)$/i.test(path)
      );

      for (const filePath of validPaths) {
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
          console.warn('Rust image info load fallback:', filePath, err);
          const fileName = filePath.split(/[/\\]/).pop() || filePath;
          const srcUrl = convertFileSrc(filePath);
          const img = new Image();

          img.onload = () => {
            addTasks([
              {
                sourcePath: filePath,
                fileName,
                originalWidth: img.naturalWidth || 1920,
                originalHeight: img.naturalHeight || 1080,
              },
            ]);
          };

          img.src = srcUrl;
        }
      }
    },
    [addTasks]
  );

  // Native Tauri v2 window Drag & Drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function setupTauriDragDrop() {
      try {
        const webview = getCurrentWebviewWindow();
        unlisten = await webview.onDragDropEvent((event) => {
          const payload = event.payload;
          if (payload.type === 'over' || payload.type === 'enter') {
            setIsDraggingFile(true);
          } else if (payload.type === 'drop') {
            setIsDraggingFile(false);
            if (payload.paths && payload.paths.length > 0) {
              processFilePaths(payload.paths);
            }
          } else {
            setIsDraggingFile(false);
          }
        });
      } catch (err) {
        console.warn('Native drag & drop listener setup failed:', err);
      }
    }

    setupTauriDragDrop();

    return () => {
      if (unlisten) unlisten();
    };
  }, [processFilePaths]);

  // HTML5 Drag and Drop fallback
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const paths: string[] = [];
      Array.from(e.dataTransfer.files).forEach((file) => {
        const path = (file as any).path || file.name;
        if (path) paths.push(path);
      });
      if (paths.length > 0) {
        processFilePaths(paths);
      }
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-screen h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden relative select-none"
    >
      {/* Global Drag & Drop Overlay */}
      {isDraggingFile && (
        <div className="absolute inset-0 z-50 bg-emerald-950/80 backdrop-blur-md border-4 border-dashed border-emerald-400 flex flex-col items-center justify-center text-emerald-300 animate-fadeIn pointer-events-none">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-4">
            <span className="text-3xl">📁</span>
          </div>
          <p className="text-xl font-bold">ここに画像をドロップ</p>
          <p className="text-sm text-emerald-400/80 mt-1">タスクキューに一括追加します</p>
        </div>
      )}

      {/* Header Toolbar */}
      <Header onOpenExportModal={() => setIsExportModalOpen(true)} />

      {/* Main Workspace (Sidebar + Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {isSidebarOpen && <Sidebar />}
        <CropCanvas />
      </div>

      {/* Export Settings & Progress Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />
    </div>
  );
};

export default App;
