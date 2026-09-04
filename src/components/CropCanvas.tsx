import React, { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCropStore } from '../store/cropStore';
import { CropRect } from '../types/crop';
import { getPresetByMode } from '../utils/presets';
import { Eye, RotateCcw } from 'lucide-react';

export const CropCanvas: React.FC = () => {
  const {
    tasks,
    activeTaskIndex,
    canvasBg,
    showGrid,
    activeAspectMode,
    updateCurrentCropRect,
    nextTask,
  } = useCropStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const currentTask = tasks[activeTaskIndex];

  // Dragging state
  const [isDraggingPan, setIsDraggingPan] = useState<boolean>(false);
  const [isResizing, setIsResizing] = useState<string | null>(null); // 'nw', 'ne', 'se', 'sw', 'n', 's', 'e', 'w'
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startCrop: CropRect }>({
    mouseX: 0,
    mouseY: 0,
    startCrop: { x: 0, y: 0, width: 0, height: 0 },
  });

  // Viewport container size
  const [containerSize, setContainerSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          w: containerRef.current.clientWidth,
          h: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const preset = getPresetByMode(activeAspectMode);
  const crop = currentTask?.cropRect || { x: 0, y: 0, width: 100, height: 100 };
  const origW = currentTask?.originalWidth || 100;
  const origH = currentTask?.originalHeight || 100;

  // Local input string states for lower-left direct dimension controls
  const [inputW, setInputW] = useState<string>('');
  const [inputH, setInputH] = useState<string>('');

  useEffect(() => {
    setInputW(crop.width.toString());
    setInputH(crop.height.toString());
  }, [crop.width, crop.height]);

  const handleDirectWidthChange = (targetW: number) => {
    if (!currentTask) return;
    const ratio = preset.ratio;

    let newW = Math.max(30, Math.min(origW, targetW));
    let newH = crop.height;

    if (ratio) {
      newH = Math.round(newW / ratio);
      if (newH > origH) {
        newH = origH;
        newW = Math.round(newH * ratio);
      }
      if (newH < 30) {
        newH = 30;
        newW = Math.round(newH * ratio);
      }
    } else {
      newH = Math.max(30, Math.min(origH, crop.height));
    }

    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;

    let newX = Math.round(centerX - newW / 2);
    let newY = Math.round(centerY - newH / 2);

    newX = Math.max(0, Math.min(origW - newW, newX));
    newY = Math.max(0, Math.min(origH - newH, newY));

    updateCurrentCropRect({
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    });
  };

  const handleDirectHeightChange = (targetH: number) => {
    if (!currentTask) return;
    const ratio = preset.ratio;

    let newH = Math.max(30, Math.min(origH, targetH));
    let newW = crop.width;

    if (ratio) {
      newW = Math.round(newH * ratio);
      if (newW > origW) {
        newW = origW;
        newH = Math.round(newW / ratio);
      }
      if (newW < 30) {
        newW = 30;
        newH = Math.round(newW * ratio);
      }
    } else {
      newW = Math.max(30, Math.min(origW, crop.width));
    }

    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;

    let newX = Math.round(centerX - newW / 2);
    let newY = Math.round(centerY - newH / 2);

    newX = Math.max(0, Math.min(origW - newW, newX));
    newY = Math.max(0, Math.min(origH - newH, newY));

    updateCurrentCropRect({
      x: newX,
      y: newY,
      width: newW,
      height: newH,
    });
  };

  const handleWidthInputChange = (valStr: string) => {
    setInputW(valStr);
    const val = parseInt(valStr);
    if (!isNaN(val) && val > 0) {
      handleDirectWidthChange(val);
    }
  };

  const handleHeightInputChange = (valStr: string) => {
    setInputH(valStr);
    const val = parseInt(valStr);
    if (!isNaN(val) && val > 0) {
      handleDirectHeightChange(val);
    }
  };

  // Double click inside crop area to confirm & move to next task (70% of viewport)
  const maxW = containerSize.w * 0.7;
  const maxH = containerSize.h * 0.7;

  // Uniform scale factor: single number for both X and Y to prevent image stretching!
  const scaleW = maxW / Math.max(1, crop.width);
  const scaleH = maxH / Math.max(1, crop.height);
  const scale = Math.min(scaleW, scaleH);

  // Frame display size on screen (matches native cropRect * scale)
  const frameDisplayW = crop.width * scale;
  const frameDisplayH = crop.height * scale;

  // Image display size on screen (matches native image * scale)
  const imageDisplayWidth = origW * scale;
  const imageDisplayHeight = origH * scale;

  // Centered frame position in container
  const frameLeft = (containerSize.w - frameDisplayW) / 2;
  const frameTop = (containerSize.h - frameDisplayH) / 2;

  // Position image behind frame so crop.x, crop.y matches frameLeft, frameTop
  const imageLeft = frameLeft - crop.x * scale;
  const imageTop = frameTop - crop.y * scale;

  // Convert image src via Tauri file handler
  const imgSrc = currentTask ? convertFileSrc(currentTask.sourcePath) : '';

  // Wheel Zoom handler: Zooms the image inside the fixed frame with locked ratio
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!currentTask) return;

    // Wheel UP = deltaY < 0 = zoom in (shrink native cropRect width/height)
    // Wheel DOWN = deltaY > 0 = zoom out (expand native cropRect width/height)
    const zoomFactor = e.deltaY < 0 ? 0.93 : 1.07;
    const ratio = preset.ratio;

    let newW = crop.width * zoomFactor;
    let newH = crop.height * zoomFactor;

    if (ratio) {
      // Calculate max crop bounds inside origW x origH while maintaining locked ratio
      let maxWAllowed = origW;
      let maxHAllowed = origW / ratio;
      if (maxHAllowed > origH) {
        maxHAllowed = origH;
        maxWAllowed = origH * ratio;
      }

      // Minimum size check (30px)
      if (newW < 30 || newH < 30) return;

      // Maximum size check (clamped to maxWAllowed and maxHAllowed)
      if (newW > maxWAllowed || newH > maxHAllowed) {
        newW = maxWAllowed;
        newH = maxHAllowed;
      }
    } else {
      // Free Mode
      if (newW < 30 || newH < 30) return;
      newW = Math.min(origW, newW);
      newH = Math.min(origH, newH);
    }

    // Keep center of crop fixed
    const centerX = crop.x + crop.width / 2;
    const centerY = crop.y + crop.height / 2;

    let newX = centerX - newW / 2;
    let newY = centerY - newH / 2;

    // Clamp inside image bounds [0, 0, origW, origH]
    newX = Math.max(0, Math.min(origW - newW, newX));
    newY = Math.max(0, Math.min(origH - newH, newY));

    updateCurrentCropRect({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newW),
      height: Math.round(newH),
    });
  };

  // Double click inside crop area to confirm & move to next task
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    nextTask();
  };

  // Start dragging for Pan or Resize
  const handleMouseDownPan = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDraggingPan(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const handleMouseDownResize = (e: React.MouseEvent, handle: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsResizing(handle);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startCrop: { ...crop },
    };
  };

  // Mouse Move handler for Pan and Frame Resizing (Fixed Ratio / Free Mode)
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!currentTask) return;

      const deltaX = (e.clientX - dragStartRef.current.mouseX) / scale;
      const deltaY = (e.clientY - dragStartRef.current.mouseY) / scale;

      const startCrop = dragStartRef.current.startCrop;

      if (isDraggingPan) {
        // Dragging inside frame pans the image behind the frame
        let newX = startCrop.x - deltaX;
        let newY = startCrop.y - deltaY;

        // Contain & Clamp: CropRect must stay strictly inside image [0, 0, origW, origH]
        newX = Math.max(0, Math.min(origW - startCrop.width, newX));
        newY = Math.max(0, Math.min(origH - startCrop.height, newY));

        updateCurrentCropRect({
          x: Math.round(newX),
          y: Math.round(newY),
          width: startCrop.width,
          height: startCrop.height,
        });
      } else if (isResizing) {
        const isFixedRatio = activeAspectMode !== 'free' && !!preset.ratio;
        const ratio = preset.ratio || startCrop.width / startCrop.height;

        let x = startCrop.x;
        let y = startCrop.y;
        let w = startCrop.width;
        let h = startCrop.height;

        if (isFixedRatio) {
          // Locked Ratio Resizing (1:1, 16:9, 4:3, 3:4, 9:16)
          if (isResizing === 'se') {
            const maxW = origW - startCrop.x;
            const maxH = origH - startCrop.y;
            const limitW = Math.min(maxW, maxH * ratio);

            let newW = Math.max(30, Math.min(limitW, startCrop.width + deltaX));
            let newH = newW / ratio;

            w = newW;
            h = newH;
          } else if (isResizing === 'sw') {
            const maxW = startCrop.x + startCrop.width;
            const maxH = origH - startCrop.y;
            const limitW = Math.min(maxW, maxH * ratio);

            let newW = Math.max(30, Math.min(limitW, startCrop.width - deltaX));
            let newH = newW / ratio;

            x = startCrop.x + startCrop.width - newW;
            w = newW;
            h = newH;
          } else if (isResizing === 'ne') {
            const maxW = origW - startCrop.x;
            const maxH = startCrop.y + startCrop.height;
            const limitW = Math.min(maxW, maxH * ratio);

            let newW = Math.max(30, Math.min(limitW, startCrop.width + deltaX));
            let newH = newW / ratio;

            y = startCrop.y + startCrop.height - newH;
            w = newW;
            h = newH;
          } else if (isResizing === 'nw') {
            const maxW = startCrop.x + startCrop.width;
            const maxH = startCrop.y + startCrop.height;
            const limitW = Math.min(maxW, maxH * ratio);

            let newW = Math.max(30, Math.min(limitW, startCrop.width - deltaX));
            let newH = newW / ratio;

            x = startCrop.x + startCrop.width - newW;
            y = startCrop.y + startCrop.height - newH;
            w = newW;
            h = newH;
          }
        } else {
          // Free Mode Resizing (independent handle movement)
          if (isResizing.includes('e')) {
            w = Math.max(30, Math.min(origW - startCrop.x, startCrop.width + deltaX));
          }
          if (isResizing.includes('s')) {
            h = Math.max(30, Math.min(origH - startCrop.y, startCrop.height + deltaY));
          }
          if (isResizing.includes('w')) {
            const clampedDeltaX = Math.max(-startCrop.x, Math.min(startCrop.width - 30, deltaX));
            x = startCrop.x + clampedDeltaX;
            w = startCrop.width - clampedDeltaX;
          }
          if (isResizing.includes('n')) {
            const clampedDeltaY = Math.max(-startCrop.y, Math.min(startCrop.height - 30, deltaY));
            y = startCrop.y + clampedDeltaY;
            h = startCrop.height - clampedDeltaY;
          }
        }

        updateCurrentCropRect({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(w),
          height: Math.round(h),
        });
      }
    },
    [currentTask, isDraggingPan, isResizing, scale, activeAspectMode, preset.ratio, origW, origH, updateCurrentCropRect]
  );

  const handleMouseUp = useCallback(() => {
    setIsDraggingPan(false);
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isDraggingPan || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDraggingPan, isResizing, handleMouseMove, handleMouseUp]);

  if (!currentTask) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-950 text-zinc-500 p-8 select-none">
        <div className="w-16 h-16 mb-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
          <Eye className="w-8 h-8 opacity-60" />
        </div>
        <p className="text-lg font-medium text-zinc-300">画像がロードされていません</p>
        <p className="text-sm text-zinc-500 mt-1">サイドバーまたは画面に画像をドラッグ＆ドロップしてください</p>
      </div>
    );
  }

  const bgClasses = {
    dark: 'bg-zinc-950',
    light: 'bg-zinc-200',
    checkerboard: 'bg-checkerboard',
  }[canvasBg];

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing transition-colors duration-200 select-none ${bgClasses}`}
    >
      {/* Native Image rendered behind crop frame - max-w-none max-h-none object-fill prevents CSS distortion! */}
      <img
        src={imgSrc}
        alt={currentTask.fileName}
        className="absolute pointer-events-none select-none max-w-none max-h-none object-fill transition-all duration-75"
        style={{
          width: `${imageDisplayWidth}px`,
          height: `${imageDisplayHeight}px`,
          left: `${imageLeft}px`,
          top: `${imageTop}px`,
        }}
        draggable={false}
      />

      {/* Dark Masking Overlay outside crop area */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top mask */}
        <div
          className="absolute bg-black/65 backdrop-blur-[1px]"
          style={{ top: 0, left: 0, width: '100%', height: `${frameTop}px` }}
        />
        {/* Bottom mask */}
        <div
          className="absolute bg-black/65 backdrop-blur-[1px]"
          style={{
            top: `${frameTop + frameDisplayH}px`,
            left: 0,
            width: '100%',
            height: `${containerSize.h - (frameTop + frameDisplayH)}px`,
          }}
        />
        {/* Left mask */}
        <div
          className="absolute bg-black/65 backdrop-blur-[1px]"
          style={{
            top: `${frameTop}px`,
            left: 0,
            width: `${frameLeft}px`,
            height: `${frameDisplayH}px`,
          }}
        />
        {/* Right mask */}
        <div
          className="absolute bg-black/65 backdrop-blur-[1px]"
          style={{
            top: `${frameTop}px`,
            left: `${frameLeft + frameDisplayW}px`,
            width: `${containerSize.w - (frameLeft + frameDisplayW)}px`,
            height: `${frameDisplayH}px`,
          }}
        />
      </div>

      {/* Centered Crop Frame Box (Stationary on screen during wheeling) */}
      <div
        onMouseDown={handleMouseDownPan}
        onDoubleClick={handleDoubleClick}
        className="absolute border-2 border-emerald-400/90 shadow-[0_0_20px_rgba(52,211,153,0.3)] cursor-move group"
        style={{
          top: `${frameTop}px`,
          left: `${frameLeft}px`,
          width: `${frameDisplayW}px`,
          height: `${frameDisplayH}px`,
        }}
      >
        {/* Rule of Thirds Grid Lines */}
        {showGrid && (
          <div className="w-full h-full pointer-events-none relative">
            <div className="absolute inset-x-0 top-1/3 border-b border-emerald-400/30" />
            <div className="absolute inset-x-0 top-2/3 border-b border-emerald-400/30" />
            <div className="absolute inset-y-0 left-1/3 border-r border-emerald-400/30" />
            <div className="absolute inset-y-0 left-2/3 border-r border-emerald-400/30" />
          </div>
        )}

        {/* Corner Guides */}
        <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400" />
        <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400" />
        <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400" />
        <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400" />

        {/* Dimension Tooltip Badge */}
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-zinc-900/85 backdrop-blur text-[10px] font-mono text-emerald-300 border border-emerald-500/20 pointer-events-none select-none">
          {crop.width} × {crop.height} px
          <span className="ml-1.5 text-zinc-400">({currentTask.aspectMode})</span>
        </div>

        {/* Corner Handles (Available in ALL Modes: 1:1, 16:9, 4:3, Free, etc.) */}
        <div
          onMouseDown={(e) => handleMouseDownResize(e, 'nw')}
          className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-emerald-400 rounded-full border-2 border-zinc-950 cursor-nwse-resize hover:scale-125 transition-transform"
          title="比率を維持してリサイズ"
        />
        <div
          onMouseDown={(e) => handleMouseDownResize(e, 'ne')}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-emerald-400 rounded-full border-2 border-zinc-950 cursor-nesw-resize hover:scale-125 transition-transform"
          title="比率を維持してリサイズ"
        />
        <div
          onMouseDown={(e) => handleMouseDownResize(e, 'se')}
          className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-emerald-400 rounded-full border-2 border-zinc-950 cursor-nwse-resize hover:scale-125 transition-transform"
          title="比率を維持してリサイズ"
        />
        <div
          onMouseDown={(e) => handleMouseDownResize(e, 'sw')}
          className="absolute -bottom-1.5 -left-1.5 w-4 h-4 bg-emerald-400 rounded-full border-2 border-zinc-950 cursor-nesw-resize hover:scale-125 transition-transform"
          title="比率を維持してリサイズ"
        />

        {/* Edge Handles (Available in Free Mode Only) */}
        {activeAspectMode === 'free' && (
          <>
            <div
              onMouseDown={(e) => handleMouseDownResize(e, 'n')}
              className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-emerald-400 rounded-full cursor-ns-resize hover:scale-110 transition-transform"
            />
            <div
              onMouseDown={(e) => handleMouseDownResize(e, 's')}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-emerald-400 rounded-full cursor-ns-resize hover:scale-110 transition-transform"
            />
            <div
              onMouseDown={(e) => handleMouseDownResize(e, 'w')}
              className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-6 bg-emerald-400 rounded-full cursor-ew-resize hover:scale-110 transition-transform"
            />
            <div
              onMouseDown={(e) => handleMouseDownResize(e, 'e')}
              className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-emerald-400 rounded-full cursor-ew-resize hover:scale-110 transition-transform"
            />
          </>
        )}
      </div>

      {/* Floating Info & Crop Dimension Input Badge */}
      <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-zinc-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-300 shadow-xl select-none">
        <span className="text-zinc-400 font-mono font-semibold text-[11px]">構図固定枠:</span>
        <div className="flex items-center space-x-1.5 font-mono">
          <input
            type="number"
            value={inputW}
            onChange={(e) => handleWidthInputChange(e.target.value)}
            onBlur={() => {
              if (!inputW || parseInt(inputW) <= 0) setInputW(crop.width.toString());
            }}
            className="w-16 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-emerald-400 font-mono text-xs text-center focus:outline-none focus:border-emerald-500 transition"
            title="枠の幅 (px)"
          />
          <span className="text-zinc-500 font-bold">×</span>
          <input
            type="number"
            value={inputH}
            onChange={(e) => handleHeightInputChange(e.target.value)}
            onBlur={() => {
              if (!inputH || parseInt(inputH) <= 0) setInputH(crop.height.toString());
            }}
            className="w-16 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-700 text-emerald-400 font-mono text-xs text-center focus:outline-none focus:border-emerald-500 transition"
            title="枠の高さ (px)"
          />
          <span className="text-zinc-400 text-[11px]">px</span>
          <span className="text-[10px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 ml-1">
            {activeAspectMode}
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-800 my-auto mx-1" />

        <button
          onClick={() => {
            const initialRect = getPresetByMode(activeAspectMode);
            const ratio = initialRect.ratio || 1;
            let w = Math.round(origW * 0.8);
            let h = Math.round(w / ratio);

            if (h > origH) {
              h = Math.round(origH * 0.8);
              w = Math.round(h * ratio);
            }

            updateCurrentCropRect({
              x: Math.round((origW - w) / 2),
              y: Math.round((origH - h) / 2),
              width: w,
              height: h,
            });
          }}
          className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
          title="クロップ位置・サイズをリセット"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
