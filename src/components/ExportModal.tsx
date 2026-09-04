import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useCropStore } from '../store/cropStore';
import { FormatOption, ResolutionOption, ExportSettingsPayload, ExportProgressEvent } from '../types/crop';
import { getPresetByMode } from '../utils/presets';
import { Download, X, Folder, Archive, FileImage, ShieldCheck, RefreshCw, AlertCircle } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { tasks, getExportTasksPayload } = useCropStore();

  // Export settings state
  const [formatOption, setFormatOption] = useState<FormatOption>('keep_original');
  const [quality, setQuality] = useState<number>(92);
  const [createZip, setCreateZip] = useState<boolean>(false);
  const [destinationPath, setDestinationPath] = useState<string>('');

  // Resolution settings map per aspect mode
  const [resolutions, setResolutions] = useState<Record<string, ResolutionOption>>({});

  // Export progress state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<ExportProgressEvent>({ completed: 0, total: 0, currentFileName: '' });
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [actualDestinationPath, setActualDestinationPath] = useState<string | null>(null);

  // Extract unique aspect modes from tasks
  const uniqueAspectModes = Array.from(new Set(tasks.map((t) => t.aspectMode)));

  useEffect(() => {
    if (isOpen) {
      setIsCompleted(false);
      setIsExporting(false);
      setExportError(null);
      setActualDestinationPath(null);
      setProgress({ completed: 0, total: 0, currentFileName: '' });

      // Generate default timestamped destination folder name in Downloads
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14); // YYYYMMDDhhmmss
      setDestinationPath(`BatchCrop_${timestamp}`);

      // Initialize default resolutions to 'original'
      const initialRes: Record<string, ResolutionOption> = {};
      uniqueAspectModes.forEach((mode) => {
        initialRes[mode] = { type: 'original' };
      });
      setResolutions(initialRes);
    }
  }, [isOpen]);

  // Listen to Tauri progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      unlisten = await listen<ExportProgressEvent>('export-progress', (event) => {
        const payload = event.payload;
        setProgress(payload);

        if (payload.isDone) {
          setIsExporting(false);
          setIsCompleted(true);
          if (payload.actualDestinationPath) {
            setActualDestinationPath(payload.actualDestinationPath);
          }
        }
        if (payload.error) {
          setIsExporting(false);
          setExportError(payload.error);
        }
      });
    };

    if (isOpen) {
      setupListener();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setIsCompleted(false);
    setProgress({ completed: 0, total: tasks.length, currentFileName: '' });

    try {
      const exportTasks = getExportTasksPayload().map((task) => {
        const sourceTask = tasks.find((t) => t.id === task.id);
        const mode = sourceTask?.aspectMode || 'free';
        const resOption = resolutions[mode] || { type: 'original' };

        return {
          id: task.id,
          sourcePath: task.sourcePath,
          outputFileName: task.outputFileName,
          cropRect: task.cropRect,
          resize: resOption,
        };
      });

      const payload: ExportSettingsPayload = {
        tasks: exportTasks,
        destinationPath,
        formatOption,
        quality: formatOption === 'jpeg' || formatOption === 'webp_lossy' ? quality : undefined,
        createZip,
      };

      await invoke('execute_export', { payload });
    } catch (err: any) {
      setIsExporting(false);
      setExportError(err?.toString() || '一括エクスポート中にエラーが発生しました');
    }
  };

  const handleCloseModal = () => {
    setIsCompleted(false);
    setIsExporting(false);
    setExportError(null);
    setActualDestinationPath(null);
    onClose();
  };

  const handleCancelExport = async () => {
    try {
      await invoke('cancel_export');
      setIsExporting(false);
    } catch (err) {
      console.error('Failed to cancel export:', err);
    }
  };

  const updateResolution = (mode: string, option: ResolutionOption) => {
    setResolutions((prev) => ({ ...prev, [mode]: option }));
  };

  const getInitialExactSize = (mode: string) => {
    const p = getPresetByMode(mode);
    const r = p.ratio || (16 / 9);
    if (r >= 1) {
      const w = 1920;
      const h = Math.round(w / r);
      return { width: w, height: h };
    } else {
      const h = 1920;
      const w = Math.round(h * r);
      return { width: w, height: h };
    }
  };

  const handleExactWidthChange = (mode: string, newW: number) => {
    const p = getPresetByMode(mode);
    const r = p.ratio;
    if (r) {
      const newH = Math.max(1, Math.round(newW / r));
      updateResolution(mode, { type: 'exact', width: newW, height: newH });
    } else {
      const cur = resolutions[mode];
      const curH = cur && cur.type === 'exact' ? cur.height : 1080;
      updateResolution(mode, { type: 'exact', width: newW, height: curH });
    }
  };

  const handleExactHeightChange = (mode: string, newH: number) => {
    const p = getPresetByMode(mode);
    const r = p.ratio;
    if (r) {
      const newW = Math.max(1, Math.round(newH * r));
      updateResolution(mode, { type: 'exact', width: newW, height: newH });
    } else {
      const cur = resolutions[mode];
      const curW = cur && cur.type === 'exact' ? cur.width : 1920;
      updateResolution(mode, { type: 'exact', width: curW, height: newH });
    }
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none animate-fadeIn">
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-zinc-100">一括エクスポート設定</h3>
              <p className="text-[11px] text-zinc-400">対象: {tasks.length} 件の切り抜きタスク</p>
            </div>
          </div>

          {!isExporting && (
            <button
              onClick={handleCloseModal}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Progress / Status Overlay if exporting */}
          {isExporting ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <RefreshCw className="w-12 h-12 text-emerald-400 animate-spin opacity-80" />
                <span className="absolute font-mono text-xs font-bold text-emerald-300">
                  {progressPercent}%
                </span>
              </div>

              <div>
                <h4 className="text-base font-semibold text-zinc-100">画像の一括出力・変換中...</h4>
                <p className="text-xs font-mono text-zinc-400 mt-1 truncate max-w-md">
                  {progress.currentFileName || 'データを処理中...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full max-w-md bg-zinc-950 rounded-full h-3 overflow-hidden border border-zinc-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-200 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <p className="text-xs text-zinc-400 font-mono">
                {progress.completed} / {progress.total} 件完了
              </p>

              <button
                onClick={handleCancelExport}
                className="mt-4 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold transition"
              >
                処理を中断（キャンセル）
              </button>
            </div>
          ) : isCompleted ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-8 h-8" />
              </div>

              <div>
                <h4 className="text-base font-bold text-zinc-100">エクスポートが完了しました！</h4>
                <p className="text-xs text-zinc-400 mt-1">
                  Downloads フォルダ内の{' '}
                  <span className="font-mono text-emerald-400 font-semibold">
                    {actualDestinationPath || destinationPath}
                  </span>{' '}
                  に保存されました。
                </p>
              </div>

              <button
                onClick={handleCloseModal}
                className="mt-2 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold text-xs transition shadow-lg shadow-emerald-500/20"
              >
                閉じる
              </button>
            </div>
          ) : (
            <>
              {/* Error Alert */}
              {exportError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">エラーが発生しました: </span>
                    {exportError}
                  </div>
                </div>
              )}

              {/* 1. Resolution Settings per Aspect Mode */}
              <div>
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-3">
                  1. アスペクト比別 出力サイズ設定 (デフォルト: リサイズなし/原寸)
                </label>

                <div className="space-y-3">
                  {uniqueAspectModes.map((mode) => {
                    const currentRes = resolutions[mode] || { type: 'original' };
                    const isFree = mode === 'free';

                    return (
                      <div
                        key={mode}
                        className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-mono text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
                            [{mode}]
                          </span>

                          <div className="flex items-center space-x-4 text-xs">
                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name={`res-${mode}`}
                                checked={currentRes.type === 'original'}
                                onChange={() => updateResolution(mode, { type: 'original' })}
                                className="accent-emerald-500"
                              />
                              <span className="text-zinc-300">原寸で出力 (リサイズなし)</span>
                            </label>

                            <label className="flex items-center space-x-1.5 cursor-pointer">
                              <input
                                type="radio"
                                name={`res-${mode}`}
                                checked={currentRes.type !== 'original'}
                                onChange={() => {
                                  if (isFree) {
                                    updateResolution(mode, { type: 'longEdge', maxPixels: 1200 });
                                  } else {
                                    const initialSize = getInitialExactSize(mode);
                                    updateResolution(mode, { type: 'exact', width: initialSize.width, height: initialSize.height });
                                  }
                                }}
                                className="accent-emerald-500"
                              />
                              <span className="text-zinc-300">
                                {isFree ? '長辺上限を指定' : '指定サイズでリサイズ'}
                              </span>
                            </label>
                          </div>
                        </div>

                        {/* Exact or LongEdge Inputs */}
                        {currentRes.type === 'exact' && (
                          <div className="pl-4 flex items-center space-x-2 text-xs text-zinc-400">
                            <span>幅:</span>
                            <input
                              type="number"
                              value={currentRes.width}
                              onChange={(e) =>
                                handleExactWidthChange(mode, parseInt(e.target.value) || 1)
                              }
                              className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                            />
                            <span>x 高:</span>
                            <input
                              type="number"
                              value={currentRes.height}
                              onChange={(e) =>
                                handleExactHeightChange(mode, parseInt(e.target.value) || 1)
                              }
                              className="w-20 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
                            />
                            <span>px</span>
                            {mode !== 'free' && (
                              <span className="ml-2 text-[10px] text-emerald-400/80 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                比率維持 ({mode})
                              </span>
                            )}
                          </div>
                        )}

                        {currentRes.type === 'longEdge' && (
                          <div className="pl-4 flex items-center space-x-2 text-xs text-zinc-400">
                            <span>長辺の最大ピクセル数:</span>
                            <input
                              type="number"
                              value={currentRes.maxPixels}
                              onChange={(e) =>
                                updateResolution(mode, {
                                  type: 'longEdge',
                                  maxPixels: parseInt(e.target.value) || 100,
                                })
                              }
                              className="w-24 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs"
                            />
                            <span>px (比率維持縮小)</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Export Format Option */}
              <div>
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-3">
                  2. 保存フォーマット ＆ 画質設定
                </label>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3">
                  <div className="flex items-center space-x-3">
                    <FileImage className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <select
                      value={formatOption}
                      onChange={(e) => setFormatOption(e.target.value as FormatOption)}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="keep_original">元画像の形式を維持 (ロスレス・推奨)</option>
                      <option value="png">PNG (可逆・無劣化)</option>
                      <option value="webp_lossless">WebP (ロスレス・完全可逆)</option>
                      <option value="webp_lossy">WebP (非可逆・高圧縮)</option>
                      <option value="jpeg">JPEG (品質指定)</option>
                    </select>
                  </div>

                  {(formatOption === 'jpeg' || formatOption === 'webp_lossy') && (
                    <div className="flex items-center justify-between pl-7 pr-2 text-xs text-zinc-300">
                      <span>圧縮画質 (1-100):</span>
                      <div className="flex items-center space-x-3">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={quality}
                          onChange={(e) => setQuality(parseInt(e.target.value))}
                          className="w-32 accent-emerald-500"
                        />
                        <span className="font-mono text-emerald-400 font-bold">{quality}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Output Location & Packaging */}
              <div>
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block mb-3">
                  3. 保存先 ＆ パッケージング
                </label>

                <div className="p-4 rounded-xl bg-zinc-950/60 border border-zinc-800 space-y-3 text-xs">
                  <div className="flex items-center space-x-2">
                    <Folder className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-zinc-400">出力名:</span>
                    <input
                      type="text"
                      value={destinationPath}
                      onChange={(e) => setDestinationPath(e.target.value)}
                      className="flex-1 px-3 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-100 font-mono text-xs"
                    />
                  </div>

                  <p className="text-[11px] text-zinc-500 pl-6">
                    ※ 保存先は自動的にユーザーの <span className="text-zinc-300 font-mono">Downloads</span> フォルダ内に生成されます（既存ファイルとの上書きチェックは不要）。
                  </p>

                  <label className="flex items-center space-x-2 pl-6 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createZip}
                      onChange={(e) => setCreateZip(e.target.checked)}
                      className="accent-emerald-500 rounded"
                    />
                    <Archive className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-zinc-300">ZIP アーカイブとして保存 (.zip)</span>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        {!isExporting && !isCompleted && (
          <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
            <button
              onClick={handleCloseModal}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition"
            >
              キャンセル
            </button>

            <button
              onClick={handleStartExport}
              disabled={tasks.length === 0}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition flex items-center space-x-2 disabled:opacity-40"
            >
              <Download className="w-4 h-4" />
              <span>書き出し開始 ({tasks.length}件)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
