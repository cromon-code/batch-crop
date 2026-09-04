# 仕様書 v5.1: 高速バッチ画像クロップ＆マルチアスペクト一括エクスポートツール

* **プラットフォーム**: Windows / macOS / Linux (クロスプラットフォーム対応)
* **コア技術スタック**: Tauri v2 + React (TypeScript) + Vite + Tailwind CSS v4 + Rust (`image`, `rayon`, `zip`)
* **コア設計思想**:
  1. **無劣化・原寸ファースト**: 勝手な画質低下や不可逆圧縮は一切行わない。明示的に指定した時のみリサイズ/圧縮を実施。
  2. **枠固定 ＋ 画像操作**: プリセット枠は中央固定。画像側の「ホイール拡縮」と「ドラッグ移動」で構図を瞬時に決定。
  3. **画像領域内制限（Contain & Clamp）**: クロップ枠は常に画像領域の内側に収まるようクランプ制限し、枠外の透明/黒領域の余白トリミングは行わない。
  4. **EXIF自動回転補正**: スマホやデジカメ写真のEXIF Orientationタグを判別し、表示・クロップ処理時に自動で正しい向きに回転補正。
  5. **仮想アイテム複製**: 1枚の画像から複数切り抜く際は、同一パスを参照する軽量アイテムをタスクキューの**直後**に挿入し、同一操作テンポを維持。
  6. **Free比率の柔軟性**: Free時のみ枠自体のリサイズを許可（ホイール拡縮も併用可能）。

---

## 1. モード別 操作マトリクス

| 操作 | 固定比率 (`16:9`, `1:1`, `4:3` 等) | 自由比率 (`Free`) |
| --- | --- | --- |
| **マウスホイール** | **画像を拡大 / 縮小** | **画像を拡大 / 縮小** |
| **画像ドラッグ（枠内）** | 画像の平行移動（パン・画像領域内クランプ） | 画像の平行移動（パン・画像領域内クランプ） |
| **枠ドラッグ（四隅・辺）** | **比率固定でリサイズ可能** (四隅ハンドルを表示・アスペクト比維持) | **自由比率でリサイズ可能** (四隅・四辺ハンドルを表示) |
| **枠内ダブルクリック / `Space` / `Enter`** | **確定 ➔ キューの次画像へ遷移** | **確定 ➔ キューの次画像へ遷移** |
| **`Shift + Space` / `D`** | **確定 ➔ キューの直後に同一画像を複製して連続作業** | **確定 ➔ キューの直後に同一画像を複製して連続作業** |

---

## 2. 同一画像からの複数切り抜き仕様（アイテム複製方式）

実画像ファイルは一切コピーせず、フロントエンドのメモリ上で「同一ファイルパスを参照する新しい切り抜きタスク（アイテム）」を生成します。

```
[元画像: photo.jpg]
   │
   ├─▶ タスク1: 16:9 で全体をトリミング ──(Shift+Space)──┐
   │                                                      ▼ [タスクキューの直後に同一タスクを挿入]
   └─▶ タスク2: 1:1 で人物の顔をアップでトリミング ────(Spaceで次へ)
```

* **ショートカット `Shift + Space` または `D` (Duplicate)**:
  * 現在の切り抜き範囲を確定してキューに保持し、**タスクキューの直後（現在の画像のすぐ次）に同一タスクを挿入**して新しい切り抜き枠を再配置。
* **出力ファイル名規則**:
  * **単一の切り抜き**: 元ファイル名に `_crop` を付与（例: `photo_crop.png`）。
  * **同一元画像から複数の切り抜きが存在する場合のみ**: ファイル名の衝突を防ぐため枝番ナンバリングを自動付与（例: `photo_crop_1.png`, `photo_crop_2.png`）。

---

## 3. 画質保護・無劣化ポリシー（「勝手に圧縮しない」原則）

1. **元画像のネイティブ解像度クロップ**:
   * フロントエンドのプレビュー拡縮率とは完全に独立して動作。
   * 送信される座標は「元ファイルの実ピクセル解像度基準」であり、Rust側でネイティブファイルから直接1ピクセルの誤差もなく切り出し。

2. **デフォルトは「原寸（リサイズなし）」**:
   * 固定比率・Free比率問わず、**リサイズはデフォルトOFF（100%原寸）**。
   * ユーザーが明示的にチェックを入れて数値を指定した比率のみリサイズを実行。

3. **無劣化フォーマットの維持**:
   * エクスポート時の初期値は **「元画像フォーマットを維持（PNGはPNG、JPEGは最高画質等）」** または **「PNG / WebP(ロスレス・完全可逆)」**。
   * 意図しない不可逆圧縮によるブロックノイズや画質劣化を完全排除。

4. **EXIF自動回転補正**:
   * メタデータ（EXIF Orientation）に基づく自動回転補正を行い、無加工の正しいオリエンテーションでクロップを実施。

---

## 4. エクスポート仕様（完了ダイアログ）

全画像の処理完了後、またはヘッダーの「一括出力（完了）」ボタン押下で表示されるモーダルダイアログです。

* **出力先・保存仕様**: 変換・クロップ結果は `Downloads` フォルダ内に専用の新規ディレクトリ（または ZIP アーカイブ）として配置して保存するため、既存ファイルとの上書き確認チェックは不要。

### 4.1. アスペクト比別 出力サイズ設定

```
┌──────────────────────────────────────────────────────────────────┐
│  一括エクスポート設定                                            │
├──────────────────────────────────────────────────────────────────┤
│  ▼ 出力解像度設定 (デフォルト: リサイズなし/原寸)                │
│                                                                  │
│  [16:9] [x] 原寸で出力 (リサイズなし)                           │
│         [ ] サイズを指定: [ 1920 ] x [ 1080 ] px (アスペクト比維持)  │
│                                                                  │
│  [1:1 ] [ ] 原寸で出力                                           │
│         [x] サイズを指定: [  500 ] x [  500 ] px (アスペクト比維持)  │
│                                                                  │
│  [Free(113:44)] [x] 原寸で出力 (推奨)                             │
│         [ ] 長辺の上限を指定: [ 1200 ] px (アスペクト比維持)     │
│                                                                  │
│  [Free(33.5:54)] [x] 原寸で出力 (推奨)                            │
│         [ ] 長辺の上限を指定: [ 1200 ] px (アスペクト比維持)     │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  フォーマット: [ 元画像の形式を維持 (ロスレス) ▼ ]               │
│                ※ PNG / WebP (可逆) / JPEG (品質指定) も選択可能  │
│                                                                  │
│  パッケージ:   [x] ZIPアーカイブとして保存 (.zip)                │
│                [ ] 比率ごとにサブフォルダを作成して分類          │
│                                                                  │
│  [キャンセル]                                    [書き出し開始]  │
└──────────────────────────────────────────────────────────────────┘
```

* **固定比率 (`16:9`, `1:1` など)**:
  * 「原寸」または「`幅 x 高さ` のピクセル指定」を選択可能。
  * 比率は常にロックされる。
* **自由比率 (`Free`)**:
  * 原寸のまま（デフォルト）：切り抜いた元画像のピクセル解像度のまま出力。
  * 「原寸（デフォルト）」または「長辺の上限px指定（アスペクト比維持縮小）」を選択可能。

### 4.2. 一括エクスポート実行・リアルタイム進捗と中断
* **リアルタイム進捗表示**:
  * Tauriのイベント（`emit`）により、書き出し完了数をプログレスバーおよび数値（例: `42 / 150 件完了 (28%)`）で表示。
* **キャンセル機能**:
  * エクスポート実行中に処理を途中で安全に停止可能。

---

## 5. データ構造と型定義

### 5.1. フロントエンド状態管理 (TypeScript)

```typescript
export type AspectMode = 'free' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';

export interface CropTaskItem {
  id: string;              // UUID
  sourcePath: string;      // 元画像ファイルパス
  fileName: string;        // photo.jpg
  originalWidth: number;   // 原寸横幅
  originalHeight: number;  // 原寸縦幅
  aspectMode: AspectMode;
  // 元画像の原寸ピクセル座標（常に画像領域内）
  cropRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isCompleted: boolean;
}

// エクスポート解像度設定
export type ResolutionOption = 
  | { type: 'original' }
  | { type: 'exact'; width: number; height: number } // 固定比率用
  | { type: 'longEdge'; maxPixels: number };         // Free用

export interface ExportSettingsPayload {
  tasks: Array<{
    sourcePath: string;
    outputFileName: string;
    cropRect: { x: number; y: number; width: number; height: number };
    resize: ResolutionOption;
  }>;
  destinationPath: string;  // 出力先フォルダ or ZIPファイルパス
  formatOption: 'keep_original' | 'png' | 'webp_lossless' | 'webp_lossy' | 'jpeg';
  quality?: number;         // 非可逆選択時のみ (1-100)
  createZip: boolean;
}
```

---

## 6. Rust バックエンド処理パイプライン

Tauriのコマンドから呼ばれ、`rayon` を用いてマルチコア並列でディスク読み出し・EXIF自動回転・境界クランプ・切り抜き・保存を実行します。

```rust
use image::{imageops::FilterType, DynamicImage, GenericImageView};
use rayon::prelude::*;
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum ResizeOption {
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "exact")]
    Exact { width: u32, height: u32 },
    #[serde(rename = "longEdge")]
    LongEdge { max_pixels: u32 },
}

pub fn execute_crop_and_resize(
    img: &DynamicImage,
    crop_rect: (u32, u32, u32, u32), // x, y, w, h
    resize: &ResizeOption,
) -> DynamicImage {
    let (img_w, img_h) = img.dimensions();
    let (x, y, w, h) = crop_rect;

    // 0. 安全のための境界クランプ (画像外参照によるpanic防止)
    let x = x.min(img_w);
    let y = y.min(img_h);
    let w = w.min(img_w.saturating_sub(x));
    let h = h.min(img_h.saturating_sub(y));

    // 1. ネイティブ解像度で完全に無劣化クロップ
    let cropped = img.crop_imm(x, y, w, h);

    // 2. リサイズ判定 (明示指定時のみ実行、それ以外は原寸維持)
    match resize {
        ResizeOption::Original => cropped,
        ResizeOption::Exact { width, height } => {
            cropped.resize_exact(*width, *height, FilterType::Lanczos3)
        }
        ResizeOption::LongEdge { max_pixels } => {
            let (cw, ch) = cropped.dimensions();
            if cw <= *max_pixels && ch <= *max_pixels {
                cropped // 既に上限より小さい場合は拡大リサイズせず劣化を防ぐ
            } else {
                let ratio = if cw >= ch {
                    *max_pixels as f32 / cw as f32
                } else {
                    *max_pixels as f32 / ch as f32
                };
                let tw = (cw as f32 * ratio).round() as u32;
                let th = (ch as f32 * ratio).round() as u32;
                cropped.resize_exact(tw, th, FilterType::Lanczos3)
            }
        }
    }
}
```

* **メモリ安全策（RAM突発消費防止）**:
  * `rayon` の並列実行にあたり、巨大画像の一括オープンによるメモリ高止まりを防止するため、同時処理スレッド数/タスク制御上限を設けて安全に処理を行う。

---

## 7. UI / QoL機能 ＆ 操作ショートカット総覧

### 7.1. 構図決定支援（QoL機能）
* **三分割法（Rule of Thirds）ガイド表示**: クロップ枠内に9分割グリッドを表示・非表示可能 (`G` キー)。
* **キャンバス背景色（マット）切替**: 編集画面の背景をダーク / ライト / チェック柄（透明表示）に切り替え可能 (`B` キー)。

### 7.2. 操作ショートカット一覧

| キー / マウス | 動作 |
| --- | --- |
| **マウスホイール** | 画像の拡大 / 縮小（全モード共通） |
| **画像ドラッグ（枠内）** | 画像の平行移動（パン・枠内限定クランプ） |
| **枠ドラッグ（四隅・辺）** | 枠サイズのリサイズ（**Freeモード時のみ有効・枠内限定クランプ**） |
| **枠内ダブルクリック** | クロップ確定 ➔ **次の画像へ自動遷移** |
| **`Space` / `Enter`** | クロップ確定 ➔ **次の画像へ自動遷移** |
| **`Shift + Space` / `D`** | クロップ確定 ➔ **キューの直後に同じ画像を複製して連続切り抜き** |
| **`0`〜`5`** | アスペクト比即時切替（`0: Free`, `1: 16:9`, `2: 4:3`, `3: 1:1`, `4: 3:4`, `5: 9:16`） |
| **`G`** | 三分割法（Rule of Thirds）ガイド線の表示 / 非表示 |
| **`B`** | キャンバス背景色切替 (Dark / Light / Checkerboard) |
| **`Up`** | 前の画像に移動 |
| **`Down`** | 次の画像に移動 |
| **`Cmd/Ctrl + Z`** | クロップ範囲操作の取り消し (Undo) |
| **`Cmd/Ctrl + D`** | 現在の画像をタスクキューの直後に複製 |