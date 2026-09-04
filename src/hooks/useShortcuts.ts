import { useEffect } from 'react';
import { useCropStore } from '../store/cropStore';
import { AspectMode } from '../types/crop';

export const useShortcuts = () => {
  const {
    nextTask,
    prevTask,
    duplicateCurrentTask,
    setAspectMode,
    toggleGrid,
    toggleSidebar,
    cycleCanvasBg,
  } = useCropStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcut keys when typing inside an input element
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Ctrl + B or Cmd + B -> Toggle sidebar visibility
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Shift + Space OR 'd' / 'D' -> Duplicate task directly after
      if ((e.shiftKey && e.code === 'Space') || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        duplicateCurrentTask();
        return;
      }

      // Space or Enter -> Move to next task
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        nextTask();
        return;
      }

      // Up Arrow -> Previous task
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        prevTask();
        return;
      }

      // Down Arrow -> Next task
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        nextTask();
        return;
      }

      // 'g' or 'G' -> Toggle grid
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        toggleGrid();
        return;
      }

      // Single 'b' or 'B' (without Ctrl/Cmd) -> Cycle canvas background
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        cycleCanvasBg();
        return;
      }

      // Number keys '0' to '5' for Aspect Mode
      const aspectMap: Record<string, AspectMode> = {
        '0': 'free',
        '1': '16:9',
        '2': '4:3',
        '3': '1:1',
        '4': '3:4',
        '5': '9:16',
      };

      if (aspectMap[e.key]) {
        e.preventDefault();
        setAspectMode(aspectMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextTask, prevTask, duplicateCurrentTask, setAspectMode, toggleGrid, toggleSidebar, cycleCanvasBg]);
};
