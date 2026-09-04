use image::{imageops::FilterType, DynamicImage, GenericImageView, ImageFormat};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use zip::write::SimpleFileOptions;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CropRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ResizeOption {
    #[serde(rename = "original")]
    Original,
    #[serde(rename = "exact")]
    Exact { width: u32, height: u32 },
    #[serde(rename = "longEdge")]
    LongEdge {
        #[serde(rename = "maxPixels")]
        max_pixels: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FormatOption {
    KeepOriginal,
    Png,
    WebpLossless,
    WebpLossy,
    Jpeg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPayload {
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    #[serde(rename = "outputFileName")]
    pub output_file_name: String,
    #[serde(rename = "cropRect")]
    pub crop_rect: CropRect,
    pub resize: ResizeOption,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSettingsPayload {
    pub tasks: Vec<TaskPayload>,
    #[serde(rename = "destinationPath")]
    pub destination_path: String,
    #[serde(rename = "formatOption")]
    pub format_option: FormatOption,
    pub quality: Option<u8>,
    #[serde(rename = "createZip")]
    pub create_zip: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportProgressEvent {
    pub completed: usize,
    pub total: usize,
    #[serde(rename = "currentFileName")]
    pub current_file_name: String,
    #[serde(rename = "isDone")]
    pub is_done: bool,
    pub error: Option<String>,
    #[serde(rename = "actualDestinationPath")]
    pub actual_destination_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageInfoResponse {
    pub width: u32,
    pub height: u32,
    #[serde(rename = "sourcePath")]
    pub source_path: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
}

pub fn get_image_info(source_path: &str) -> Result<ImageInfoResponse, String> {
    let path = Path::new(source_path);
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| source_path.to_string());

    let img_reader = image::ImageReader::open(path)
        .map_err(|e| format!("ファイルが開けません ({}): {}", source_path, e))?;
    let img_reader = img_reader
        .with_guessed_format()
        .map_err(|e| format!("画像フォーマット判定エラー ({}): {}", source_path, e))?;
    let (width, height) = img_reader
        .into_dimensions()
        .map_err(|e| format!("画像の寸法取得に失敗しました ({}): {}", source_path, e))?;

    Ok(ImageInfoResponse {
        width,
        height,
        source_path: source_path.to_string(),
        file_name,
    })
}

/// Safely crops and resizes a DynamicImage with boundary clamping
pub fn execute_crop_and_resize(
    img: &DynamicImage,
    crop_rect: &CropRect,
    resize: &ResizeOption,
) -> DynamicImage {
    let (img_w, img_h) = img.dimensions();

    // 0. Boundary Clamping: Ensure x, y, width, height are strictly inside image boundaries
    let x = crop_rect.x.min(img_w);
    let y = crop_rect.y.min(img_h);
    let w = crop_rect.width.min(img_w.saturating_sub(x));
    let h = crop_rect.height.min(img_h.saturating_sub(y));

    // Prevent 0-sized crop panic
    let w = w.max(1);
    let h = h.max(1);

    // 1. Native Lossless Crop
    let cropped = img.crop_imm(x, y, w, h);

    // 2. Resize Logic
    match resize {
        ResizeOption::Original => cropped,
        ResizeOption::Exact { width, height } => {
            cropped.resize_exact(*width, *height, FilterType::Lanczos3)
        }
        ResizeOption::LongEdge { max_pixels } => {
            let (cw, ch) = cropped.dimensions();
            if cw <= *max_pixels && ch <= *max_pixels {
                cropped // Already smaller than max, avoid upscaling degradation
            } else {
                let ratio = if cw >= ch {
                    *max_pixels as f32 / cw as f32
                } else {
                    *max_pixels as f32 / ch as f32
                };
                let tw = ((cw as f32 * ratio).round() as u32).max(1);
                let th = ((ch as f32 * ratio).round() as u32).max(1);
                cropped.resize_exact(tw, th, FilterType::Lanczos3)
            }
        }
    }
}

/// Resolves a non-conflicting directory path in downloads_dir by appending (1), (2), etc. if it exists.
pub fn get_unique_dir_path(downloads_dir: &Path, base_name: &str) -> (String, std::path::PathBuf) {
    let clean_base = base_name.trim();
    let clean_base = if clean_base.is_empty() {
        "BatchCrop_Export"
    } else {
        clean_base
    };

    let mut candidate_name = clean_base.to_string();
    let mut candidate_path = downloads_dir.join(&candidate_name);
    let mut counter = 1;

    while candidate_path.exists() {
        candidate_name = format!("{}({})", clean_base, counter);
        candidate_path = downloads_dir.join(&candidate_name);
        counter += 1;
    }

    (candidate_name, candidate_path)
}

/// Resolves a non-conflicting zip file path in downloads_dir by appending (1), (2), etc. if it exists.
pub fn get_unique_zip_path(downloads_dir: &Path, base_name: &str) -> std::path::PathBuf {
    let clean_base = base_name.trim();
    let clean_base = if clean_base.is_empty() {
        "BatchCrop_Export"
    } else {
        clean_base
    };

    let mut candidate_zip_name = format!("{}.zip", clean_base);
    let mut candidate_zip_path = downloads_dir.join(&candidate_zip_name);
    let mut counter = 1;

    while candidate_zip_path.exists() {
        candidate_zip_name = format!("{}({}).zip", clean_base, counter);
        candidate_zip_path = downloads_dir.join(&candidate_zip_name);
        counter += 1;
    }

    candidate_zip_path
}

/// Executes batch export using Rayon parallel processing with progress emit & cancellation
pub fn process_batch_export(
    app: AppHandle,
    payload: ExportSettingsPayload,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    // 1. Resolve Downloads folder
    let downloads_dir = dirs::download_dir().ok_or_else(|| "Downloads フォルダが見つかりません".to_string())?;

    // 2. Resolve non-conflicting target directory in Downloads (append (1), (2) if name already exists)
    let (final_dir_name, target_dir) = get_unique_dir_path(&downloads_dir, &payload.destination_path);

    fs::create_dir_all(&target_dir).map_err(|e| format!("出力ディレクトリの作成に失敗しました: {}", e))?;

    let total = payload.tasks.len();
    let completed_counter = Arc::new(AtomicUsize::new(0));

    // Limit concurrency to prevent RAM exhaustion on large batch processing
    let max_threads = rayon::current_num_threads().min(4);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(max_threads)
        .build()
        .map_err(|e| format!("スレッドプールの生成に失敗しました: {}", e))?;

    let cancel_flag_clone = cancel_flag.clone();
    let payload_arc = Arc::new(payload);
    let app_arc = Arc::new(app);
    let target_dir_arc = Arc::new(target_dir);

    let result = pool.install(|| {
        payload_arc.tasks.par_iter().try_for_each(|task| {
            if cancel_flag_clone.load(Ordering::Relaxed) {
                return Err("処理が中断されました".to_string());
            }

            // Load Image with format guessing by content header (magic bytes) & EXIF orientation
            let img_reader = image::ImageReader::open(&task.source_path)
                .map_err(|e| format!("ファイルのオープンに失敗しました ({}) : {}", task.source_path, e))?;
            let img_reader = img_reader
                .with_guessed_format()
                .map_err(|e| format!("画像のフォーマット判定に失敗しました ({}) : {}", task.source_path, e))?;
            let img = img_reader
                .decode()
                .map_err(|e| format!("画像の解読・デコードに失敗しました ({}) : {}", task.source_path, e))?;

            // Crop & Resize
            let processed_img = execute_crop_and_resize(&img, &task.crop_rect, &task.resize);

            // Determine output path & encoding format
            let out_file_name = &task.output_file_name;
            let out_path = target_dir_arc.join(out_file_name);

            save_image_with_format(
                &processed_img,
                &out_path,
                &payload_arc.format_option,
                payload_arc.quality.unwrap_or(92),
            )?;

            let completed = completed_counter.fetch_add(1, Ordering::Relaxed) + 1;

            // Emit progress event to Tauri frontend
            let _ = app_arc.emit(
                "export-progress",
                ExportProgressEvent {
                    completed,
                    total,
                    current_file_name: out_file_name.clone(),
                    is_done: false,
                    error: None,
                    actual_destination_path: None,
                },
            );

            Ok(())
        })
    });

    if let Err(e) = result {
        let _ = app_arc.emit(
            "export-progress",
            ExportProgressEvent {
                completed: completed_counter.load(Ordering::Relaxed),
                total,
                current_file_name: "".to_string(),
                is_done: false,
                error: Some(e.clone()),
                actual_destination_path: None,
            },
        );
        return Err(e);
    }

    // If create_zip is requested, compress target_dir into a non-conflicting .zip file in Downloads
    if payload_arc.create_zip {
        let zip_path = get_unique_zip_path(&downloads_dir, &final_dir_name);
        create_zip_archive(&target_dir_arc, &zip_path)?;
    }

    // Send final completed event with actual_destination_path
    let _ = app_arc.emit(
        "export-progress",
        ExportProgressEvent {
            completed: total,
            total,
            current_file_name: "".to_string(),
            is_done: true,
            error: None,
            actual_destination_path: Some(final_dir_name),
        },
    );

    Ok(())
}

fn save_image_with_format(
    img: &DynamicImage,
    out_path: &Path,
    format_option: &FormatOption,
    quality: u8,
) -> Result<(), String> {
    match format_option {
        FormatOption::KeepOriginal => {
            let format = ImageFormat::from_path(out_path).unwrap_or(ImageFormat::Png);
            img.save_with_format(out_path, format)
                .map_err(|e| format!("保存に失敗しました ({}): {}", out_path.display(), e))
        }
        FormatOption::Png => {
            img.save_with_format(out_path, ImageFormat::Png)
                .map_err(|e| format!("PNG保存に失敗しました: {}", e))
        }
        FormatOption::WebpLossless | FormatOption::WebpLossy => {
            img.save_with_format(out_path, ImageFormat::WebP)
                .map_err(|e| format!("WebP保存に失敗しました: {}", e))
        }
        FormatOption::Jpeg => {
            let mut file = BufWriter::new(
                File::create(out_path).map_err(|e| format!("ファイル作成に失敗しました: {}", e))?,
            );
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, quality);
            encoder
                .encode_image(img)
                .map_err(|e| format!("JPEGエンコードに失敗しました: {}", e))
        }
    }
}

fn create_zip_archive(src_dir: &Path, zip_path: &Path) -> Result<(), String> {
    let zip_file = File::create(zip_path).map_err(|e| format!("ZIPファイルの作成に失敗しました: {}", e))?;
    let mut zip = zip::ZipWriter::new(zip_file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let read_dir = fs::read_dir(src_dir).map_err(|e| format!("ディレクトリの読み取りに失敗しました: {}", e))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("エントリの取得に失敗しました: {}", e))?;
        let path = entry.path();
        if path.is_file() {
            let name = path
                .file_name()
                .ok_or("ファイル名取得エラー")?
                .to_string_lossy();
            zip.start_file(name, options)
                .map_err(|e| format!("ZIPエントリ追加エラー: {}", e))?;
            let content = fs::read(&path).map_err(|e| format!("ファイル読み込みエラー: {}", e))?;
            zip.write_all(&content).map_err(|e| format!("ZIP書き込みエラー: {}", e))?;
        }
    }

    zip.finish().map_err(|e| format!("ZIP完成エラー: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crop_and_resize_in_memory() {
        let img = DynamicImage::ImageRgba8(image::RgbaImage::new(200, 200));
        let crop_res = execute_crop_and_resize(
            &img,
            &CropRect { x: 10, y: 10, width: 100, height: 100 },
            &ResizeOption::Original,
        );
        assert_eq!(crop_res.width(), 100);
        assert_eq!(crop_res.height(), 100);
    }

    #[test]
    fn test_unique_path_generation() {
        let temp_dir = std::env::temp_dir().join("batchcrop_test_unique_seq");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let (name1, path1) = get_unique_dir_path(&temp_dir, "TestExport");
        assert_eq!(name1, "TestExport");
        fs::create_dir_all(&path1).unwrap();

        let (name2, path2) = get_unique_dir_path(&temp_dir, "TestExport");
        assert_eq!(name2, "TestExport(1)");
        fs::create_dir_all(&path2).unwrap();

        let (name3, _path3) = get_unique_dir_path(&temp_dir, "TestExport");
        assert_eq!(name3, "TestExport(2)");

        let zip1 = get_unique_zip_path(&temp_dir, "TestExport");
        assert_eq!(zip1.file_name().unwrap().to_str().unwrap(), "TestExport.zip");
        File::create(&zip1).unwrap();

        let zip2 = get_unique_zip_path(&temp_dir, "TestExport");
        assert_eq!(zip2.file_name().unwrap().to_str().unwrap(), "TestExport(1).zip");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
