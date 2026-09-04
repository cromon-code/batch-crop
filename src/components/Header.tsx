import React from 'react';
import { useCropStore } from '../store/cropStore';
import { ASPECT_PRESETS } from '../utils/presets';
import { AspectMode } from '../types/crop';
import { Grid, Palette, Download, Crop, PanelLeft } from 'lucide-react';

interface HeaderProps {
  onOpenExportModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenExportModal }) => {
  const {
    tasks,
    activeAspectMode,
    setAspectMode,
    showGrid,
    toggleGrid,
    canvasBg,
    cycleCanvasBg,
    isSidebarOpen,
    toggleSidebar,
  } = useCropStore();

  return (
    <header className="h-14 bg-zinc-900 border-b border-zinc-800 px-4 flex items-center justify-between select-none">
      {/* Brand Logo / Title & Sidebar Toggle */}
      <div className="flex items-center space-x-3">
        <button
          onClick={toggleSidebar}
          className={`p-2 rounded-xl border transition text-xs flex items-center justify-center ${
            isSidebarOpen
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200'
          }`}
          title="サイドバー開閉 (Ctrl + B)"
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-zinc-950 font-bold shadow-md shadow-emerald-500/20">
            <Crop className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 leading-none">BatchCrop</h1>
            <p className="text-[10px] text-zinc-400 font-mono mt-0.5">v5.1 Batch Cropping tool</p>
          </div>
        </div>
      </div>

      {/* Aspect Ratio Preset Switcher (Dropdown for narrow screens, Button bar for wide screens) */}
      {/* 1. Narrow Screen Dropdown */}
      <div className="flex xl:hidden items-center bg-zinc-950 px-2.5 py-1 rounded-xl border border-zinc-800">
        <select
          value={activeAspectMode}
          onChange={(e) => setAspectMode(e.target.value as AspectMode)}
          className="bg-zinc-950 text-emerald-400 text-xs font-mono font-semibold py-1 focus:outline-none cursor-pointer"
        >
          {ASPECT_PRESETS.map((preset) => (
            <option key={preset.mode} value={preset.mode} className="bg-zinc-900 text-zinc-100 font-mono">
              {preset.label} [{preset.shortcut}]
            </option>
          ))}
        </select>
      </div>

      {/* 2. Wide Screen Horizontal Button List */}
      <div className="hidden xl:flex items-center bg-zinc-950 p-1 rounded-xl border border-zinc-800 space-x-1">
        {ASPECT_PRESETS.map((preset) => {
          const isActive = activeAspectMode === preset.mode;
          return (
            <button
              key={preset.mode}
              onClick={() => setAspectMode(preset.mode as AspectMode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${
                isActive
                  ? 'bg-emerald-500 text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
              }`}
            >
              <span>{preset.label}</span>
              <kbd
                className={`text-[9px] font-mono px-1 rounded ${
                  isActive ? 'bg-emerald-600/40 text-zinc-950' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {preset.shortcut}
              </kbd>
            </button>
          );
        })}
      </div>

      {/* QoL Toggles & Export Action */}
      <div className="flex items-center space-x-2">
        {/* Rule of Thirds Grid Toggle */}
        <button
          onClick={toggleGrid}
          className={`p-2 rounded-xl border transition text-xs flex items-center space-x-1.5 ${showGrid
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-zinc-800'
            }`}
          title="三分割法ガイド線 (G)"
        >
          <Grid className="w-4 h-4" />
          <span className="hidden md:inline">ガイド</span>
        </button>

        {/* Canvas Background Toggle */}
        <button
          onClick={cycleCanvasBg}
          className="p-2 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50 transition text-xs flex items-center space-x-1.5"
          title={`キャンバス背景切替: ${canvasBg} (B)`}
        >
          <Palette className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline capitalize">{canvasBg}</span>
        </button>

        <div className="h-4 w-px bg-zinc-800 my-auto mx-1" />

        {/* Batch Export Button */}
        <button
          onClick={onOpenExportModal}
          disabled={tasks.length === 0}
          className="p-2 sm:px-4 sm:py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-40 disabled:pointer-events-none transition flex items-center space-x-1.5"
          title={`一括出力 (${tasks.length}件)`}
        >
          <Download className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">一括出力 ({tasks.length})</span>
        </button>
      </div>
    </header>
  );
};
