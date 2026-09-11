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
pub struct AiEnhanceOption {
    pub enabled: bool,
    pub mode: String, // "photo", "anime", "fast"
    pub scale: u32,   // 1, 2, 4
    #[serde(rename = "autoSmallCrop")]
    pub auto_small_crop: bool,
    #[serde(rename = "smallCropThreshold")]
    pub small_crop_threshold: u32,
    #[serde(rename = "debounceMs")]
    pub debounce_ms: u64,
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
    #[serde(rename = "aiEnhance")]
    pub ai_enhance: Option<AiEnhanceOption>,
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
    #[serde(rename = "globalAiEnhance")]
    pub global_ai_enhance: Option<AiEnhanceOption>,
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

/// Safely crops, resizes, and conditionally applies AI Super-Resolution & Sharpening
pub fn process_task_image(
    img: &DynamicImage,
    crop_rect: &CropRect,
    resize: &ResizeOption,
    ai_option: Option<&AiEnhanceOption>,
) -> DynamicImage {
    let (img_w, img_h) = img.dimensions();

    // 0. Boundary Clamping: Ensure x, y, width, height are strictly inside image boundaries
    let x = crop_rect.x.min(img_w);
    let y = crop_rect.y.min(img_h);
    let w = crop_rect.width.min(img_w.saturating_sub(x)).max(1);
    let h = crop_rect.height.min(img_h.saturating_sub(y)).max(1);

    // 1. Native Lossless Crop
    let cropped = img.crop_imm(x, y, w, h);
    let (cw, ch) = cropped.dimensions();

    let ai_enabled = ai_option.map_or(false, |opt| opt.enabled);

    // 2. Perform Resizing according to specified target output dimension
    let (resized, is_upscaled) = match resize {
        ResizeOption::Original => (cropped, false),
        ResizeOption::Exact { width, height } => {
            let tw = (*width).max(1);
            let th = (*height).max(1);
            let upscaled = cw < tw || ch < th;
            (cropped.resize_exact(tw, th, FilterType::Lanczos3), upscaled)
        }
        ResizeOption::LongEdge { max_pixels } => {
            let limit = *max_pixels;
            if cw <= limit && ch <= limit {
                (cropped, false)
            } else {
                let ratio = if cw >= ch {
                    limit as f32 / cw as f32
                } else {
                    limit as f32 / ch as f32
                };
                let tw = ((cw as f32 * ratio).round() as u32).max(1);
                let th = ((ch as f32 * ratio).round() as u32).max(1);
                (cropped.resize_exact(tw, th, FilterType::Lanczos3), false)
            }
        }
    };

    // 3. Conditional AI Super Resolution & Reconstruction Filter
    if ai_enabled {
        if let Some(opt) = ai_option {
            if is_upscaled || opt.auto_small_crop || opt.enabled {
                apply_ai_enhancement(&resized, opt)
            } else {
                resized
            }
        } else {
            resized
        }
    } else {
        // AI OFF -> Strictly NO AI enhancement / NO sharpening filters!
        resized
    }
}

#[allow(dead_code)]
pub fn execute_crop_and_resize(
    img: &DynamicImage,
    crop_rect: &CropRect,
    resize: &ResizeOption,
) -> DynamicImage {
    process_task_image(img, crop_rect, resize, None)
}

/// Applies AI Super-Resolution / Image Reconstruction & Sharpening
pub fn apply_ai_enhancement(img: &DynamicImage, option: &AiEnhanceOption) -> DynamicImage {
    if !option.enabled {
        return img.clone();
    }

    // Try ONNX AI Super-Resolution inference
    if let Ok(enhanced) = run_onnx_super_resolution(img, option) {
        return enhanced;
    }

    // Fallback: Advanced Lanczos3 + Unsharp Mask filtering
    fallback_ai_enhancement(img, option)
}

static ANIME6B_MODEL_BYTES: &[u8] = include_bytes!("../models/realesrgan-anime6B.onnx");

fn run_onnx_super_resolution(img: &DynamicImage, _option: &AiEnhanceOption) -> Result<DynamicImage, String> {
    use tract_onnx::prelude::*;

    let (width, height) = img.dimensions();
    let rgb_img = img.to_rgb8();

    // Prepare NCHW float32 tensor [1, 3, H, W] normalized 0.0..1.0
    let mut image_data = Vec::with_capacity((3 * width * height) as usize);

    // R plane
    for y in 0..height {
        for x in 0..width {
            image_data.push(rgb_img.get_pixel(x, y)[0] as f32 / 255.0);
        }
    }
    // G plane
    for y in 0..height {
        for x in 0..width {
            image_data.push(rgb_img.get_pixel(x, y)[1] as f32 / 255.0);
        }
    }
    // B plane
    for y in 0..height {
        for x in 0..width {
            image_data.push(rgb_img.get_pixel(x, y)[2] as f32 / 255.0);
        }
    }

    let input_tensor = Tensor::from_shape(
        &[1, 3, height as usize, width as usize],
        &image_data,
    ).map_err(|e| format!("Tensor error: {}", e))?;

    let mut model_cursor = std::io::Cursor::new(ANIME6B_MODEL_BYTES);
    let model = tract_onnx::onnx()
        .model_for_read(&mut model_cursor)
        .map_err(|e| format!("Model load error: {}", e))?
        .into_optimized()
        .map_err(|e| format!("Model optimize error: {}", e))?
        .into_runnable()
        .map_err(|e| format!("Model run build error: {}", e))?;

    let outputs = model.run(tvec!(input_tensor.into()))
        .map_err(|e| format!("Inference error: {}", e))?;

    let output = outputs[0].to_plain_array_view::<f32>()
        .map_err(|e| format!("Output view error: {}", e))?;

    let out_shape = output.shape();
    if out_shape.len() < 4 {
        return Err("Invalid tensor shape".to_string());
    }
    let out_h = out_shape[2];
    let out_w = out_shape[3];

    let mut out_img = image::RgbImage::new(out_w as u32, out_h as u32);

    for y in 0..out_h {
        for x in 0..out_w {
            let r_val = output[[0, 0, y, x]];
            let g_val = output[[0, 1, y, x]];
            let b_val = output[[0, 2, y, x]];

            let r = (r_val.clamp(0.0, 1.0) * 255.0).round() as u8;
            let g = (g_val.clamp(0.0, 1.0) * 255.0).round() as u8;
            let b = (b_val.clamp(0.0, 1.0) * 255.0).round() as u8;

            out_img.put_pixel(x as u32, y as u32, image::Rgb([r, g, b]));
        }
    }

    Ok(DynamicImage::ImageRgb8(out_img))
}

fn fallback_ai_enhancement(img: &DynamicImage, option: &AiEnhanceOption) -> DynamicImage {
    let (w, h) = img.dimensions();
    let max_edge = w.max(h);

    let scale_factor = if option.auto_small_crop && max_edge < option.small_crop_threshold {
        option.scale.max(2)
    } else {
        option.scale
    };

    let scaled_img = if scale_factor > 1 {
        let new_w = (w * scale_factor).max(1);
        let new_h = (h * scale_factor).max(1);
        img.resize_exact(new_w, new_h, FilterType::Lanczos3)
    } else {
        img.clone()
    };

    match option.mode.as_str() {
        "anime" => {
            let unsharpened = image::imageops::unsharpen(&scaled_img, 3.0, 1);
            DynamicImage::ImageRgba8(unsharpened).adjust_contrast(10.0)
        }
        "photo" => {
            let unsharpened = image::imageops::unsharpen(&scaled_img, 2.2, 2);
            DynamicImage::ImageRgba8(unsharpened).adjust_contrast(4.0)
        }
        _ => {
            let unsharpened = image::imageops::unsharpen(&scaled_img, 1.8, 3);
            DynamicImage::ImageRgba8(unsharpened)
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

            // Crop, Resize, and conditionally apply AI Super-Resolution / Sharpening
            let ai_option = task.ai_enhance.as_ref().or(payload_arc.global_ai_enhance.as_ref());
            let processed_img = process_task_image(&img, &task.crop_rect, &task.resize, ai_option);

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
            let ext = out_path
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if ext == "webp" {
                save_webp_image(img, out_path, false, quality)
            } else {
                let format = ImageFormat::from_path(out_path).unwrap_or(ImageFormat::Png);
                img.save_with_format(out_path, format)
                    .map_err(|e| format!("保存に失敗しました ({}): {}", out_path.display(), e))
            }
        }
        FormatOption::Png => {
            img.save_with_format(out_path, ImageFormat::Png)
                .map_err(|e| format!("PNG保存に失敗しました: {}", e))
        }
        FormatOption::WebpLossless => save_webp_image(img, out_path, true, quality),
        FormatOption::WebpLossy => save_webp_image(img, out_path, false, quality),
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

fn save_webp_image(
    img: &DynamicImage,
    out_path: &Path,
    lossless: bool,
    quality: u8,
) -> Result<(), String> {
    let rgba = img.to_rgba8();
    let encoder = webp::Encoder::from_rgba(&rgba, img.width(), img.height());
    let webp_memory = if lossless {
        encoder.encode_lossless()
    } else {
        let q = (quality as f32).clamp(1.0, 100.0);
        encoder.encode(q)
    };
    fs::write(out_path, &*webp_memory)
        .map_err(|e| format!("WebP保存に失敗しました ({}): {}", out_path.display(), e))
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

    #[test]
    fn test_apply_ai_enhancement() {
        let img = DynamicImage::ImageRgba8(image::RgbaImage::new(100, 100));
        let option = AiEnhanceOption {
            enabled: true,
            mode: "photo".to_string(),
            scale: 2,
            auto_small_crop: true,
            small_crop_threshold: 800,
            debounce_ms: 300,
        };

        let enhanced = apply_ai_enhancement(&img, &option);
        // RealESRGAN anime6B ONNX model performs 4x super-resolution upscaling (100x100 -> 400x400)
        assert_eq!(enhanced.width(), 400);
        assert_eq!(enhanced.height(), 400);
    }

    #[test]
    fn test_webp_lossy_and_lossless_save() {
        let temp_dir = std::env::temp_dir().join("batchcrop_test_webp");
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();

        let img = DynamicImage::ImageRgba8(image::RgbaImage::new(100, 100));
        let lossy_path = temp_dir.join("test_lossy.webp");
        let lossless_path = temp_dir.join("test_lossless.webp");

        save_image_with_format(&img, &lossy_path, &FormatOption::WebpLossy, 80).unwrap();
        save_image_with_format(&img, &lossless_path, &FormatOption::WebpLossless, 80).unwrap();

        assert!(lossy_path.exists());
        assert!(lossless_path.exists());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
