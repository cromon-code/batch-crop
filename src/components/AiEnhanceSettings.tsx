import React from 'react';
import { useCropStore } from '../store/cropStore';
import { AiEnhanceScale } from '../types/crop';
import { Sparkles, Sliders, Zap, Image, Palette, Clock } from 'lucide-react';

export const AiEnhanceSettings: React.FC = () => {
  const { globalAiEnhance, updateGlobalAiEnhance } = useCropStore();

  return (
    <div className="p-4 bg-zinc-950/70 rounded-2xl border border-zinc-800/80 space-y-4 select-none">
      {/* Header & Main Toggle */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-xs text-zinc-100 flex items-center">
              AI画質補正・超解像 (Enhancement)
            </h3>
            <p className="text-[11px] text-zinc-400">拡大時のぼやけ・ジャギーを自動修復</p>
          </div>
        </div>

        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={globalAiEnhance.enabled}
            onChange={(e) => updateGlobalAiEnhance({ enabled: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
        </label>
      </div>

      {globalAiEnhance.enabled && (
        <div className="space-y-4 text-xs animate-fadeIn">
          {/* 1. Mode Selection */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2 flex items-center space-x-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>1. AI 補正モデル</span>
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => updateGlobalAiEnhance({ mode: 'photo' })}
                className={`py-2 px-2 rounded-xl border flex flex-col items-center justify-center space-y-1 transition ${globalAiEnhance.mode === 'photo'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
              >
                <Image className="w-4 h-4" />
                <span className="font-semibold text-[11px]">実写・写真</span>
              </button>

              <button
                type="button"
                onClick={() => updateGlobalAiEnhance({ mode: 'anime' })}
                className={`py-2 px-2 rounded-xl border flex flex-col items-center justify-center space-y-1 transition ${globalAiEnhance.mode === 'anime'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
              >
                <Palette className="w-4 h-4" />
                <span className="font-semibold text-[11px]">イラスト・CG</span>
              </button>

              <button
                type="button"
                onClick={() => updateGlobalAiEnhance({ mode: 'fast' })}
                className={`py-2 px-2 rounded-xl border flex flex-col items-center justify-center space-y-1 transition ${globalAiEnhance.mode === 'fast'
                  ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-sm'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                  }`}
              >
                <Zap className="w-4 h-4" />
                <span className="font-semibold text-[11px]">高速 (Standard)</span>
              </button>
            </div>
          </div>

          {/* 2. Scale Selection */}
          <div>
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              2. 超解像 拡大倍率
            </label>
            <div className="flex items-center space-x-2">
              {([1, 2, 4] as AiEnhanceScale[]).map((scale) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => updateGlobalAiEnhance({ scale })}
                  className={`flex-1 py-1.5 rounded-lg font-mono font-bold text-xs border transition ${globalAiEnhance.scale === scale
                    ? 'bg-emerald-500 text-zinc-950 border-emerald-400 shadow-md'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                    }`}
                >
                  {scale}x {scale === 1 ? '(等倍)' : '高解像'}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Debounce Control (Performance Load Mitigation) */}
          <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-zinc-300">
              <span className="font-bold flex items-center space-x-1 text-[11px]">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. 負荷対策 (デバウンス待機時間)</span>
              </span>
              <span className="font-mono text-emerald-400 font-semibold text-[11px]">
                {globalAiEnhance.debounceMs} ms
              </span>
            </div>

            <p className="text-[10px] text-zinc-500 leading-relaxed">
              クロップ枠操作（移動・リサイズ）停止後、指定ミリ秒待機してからAI超解像を裏でトリガーします。
            </p>

            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {[
                { label: '300ms', val: 300 },
                { label: '500ms', val: 500 },
                { label: '1000ms', val: 1000 },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  onClick={() => updateGlobalAiEnhance({ debounceMs: item.val })}
                  className={`py-1 px-2 rounded-lg font-mono text-[10px] border transition ${globalAiEnhance.debounceMs === item.val
                    ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300 font-bold'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                    }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Auto Small Crop Enhancement */}
          <div className="p-3 bg-zinc-900/80 rounded-xl border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={globalAiEnhance.autoSmallCrop}
                  onChange={(e) => updateGlobalAiEnhance({ autoSmallCrop: e.target.checked })}
                  className="accent-emerald-500 rounded"
                />
                <span className="font-bold text-zinc-300 text-[11px]">
                  小領域切り抜き時に自動超解像
                </span>
              </label>

              <span className="font-mono text-emerald-400 text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                &lt; {globalAiEnhance.smallCropThreshold} px
              </span>
            </div>

            {globalAiEnhance.autoSmallCrop && (
              <div className="pt-1 text-zinc-400">
                <div className="flex justify-between text-[10px] text-zinc-500 mb-1">
                  <span>発動閾値（長辺ピクセル）</span>
                  <span>{globalAiEnhance.smallCropThreshold} px 以下</span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="1600"
                  step="50"
                  value={globalAiEnhance.smallCropThreshold}
                  onChange={(e) => updateGlobalAiEnhance({ smallCropThreshold: parseInt(e.target.value) })}
                  className="w-full accent-emerald-500"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
