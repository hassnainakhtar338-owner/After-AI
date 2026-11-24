import React, { useRef, useState } from 'react';
import {
  Upload,
  Sparkles,
  Download,
  X,
  Loader2,
  Wand2,
  ImagePlus,
} from 'lucide-react';
import {
  ImageAspectRatio,
  ImageCreationRecord,
  ImageModelId,
  ImageSizeOption,
} from '../types';
import { IMAGE_MODELS } from '../lib/models';
import { generateOrEditImage } from '../lib/api';

interface UploadedPicture {
  id: string;
  name: string;
  mimeType: string;
  data: string;
  previewUrl: string;
}

interface ImageStudioViewProps {
  history: ImageCreationRecord[];
  onRecordCreated: (record: ImageCreationRecord) => void;
}

const STANDARD_RATIOS: ImageAspectRatio[] = ['1:1', '3:4', '4:3', '9:16', '16:9'];
const EXTENDED_RATIOS: ImageAspectRatio[] = [
  '1:1',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '1:4',
  '1:8',
  '4:1',
  '8:1',
];
const SIZES: ImageSizeOption[] = ['1K', '2K', '4K'];

export const ImageStudioView: React.FC<ImageStudioViewProps> = ({
  history,
  onRecordCreated,
}) => {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<ImageModelId>('agnes-image-2.5-flash');
  const [aspectRatio, setAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [imageSize, setImageSize] = useState<ImageSizeOption>('1K');
  const [sourceImages, setSourceImages] = useState<UploadedPicture[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionResults, setSessionResults] = useState<ImageCreationRecord[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeModelMeta =
    IMAGE_MODELS.find((m) => m.id === model) ?? IMAGE_MODELS[0];

  const availableRatios = activeModelMeta.supportsExtendedRatios
    ? EXTENDED_RATIOS
    : STANDARD_RATIOS;

  const handleModelChange = (nextModel: ImageModelId) => {
    setModel(nextModel);
    const meta = IMAGE_MODELS.find((m) => m.id === nextModel);
    if (meta && !meta.supportsExtendedRatios && !STANDARD_RATIOS.includes(aspectRatio)) {
      setAspectRatio('1:1');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setError(null);

    const added: UploadedPicture[] = [];
    for (const file of files.slice(0, 4)) {
      if (!file.type.startsWith('image/')) {
        setError(`"${file.name}" is not an image file.`);
        continue;
      }
      if (file.size > 15 * 1024 * 1024) {
        setError(`"${file.name}" exceeds 15MB limit.`);
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(file);
      });
      added.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type,
        data: dataUrl.split(',')[1] || '',
        previewUrl: dataUrl,
      });
    }

    setSourceImages((prev) => [...prev, ...added].slice(0, 4));
    e.target.value = '';
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isGenerating) return;

    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateOrEditImage({
        prompt: trimmed,
        model,
        aspectRatio,
        imageSize,
        images: sourceImages.map((img) => ({
          mimeType: img.mimeType,
          data: img.data,
        })),
      });

      const record: ImageCreationRecord = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        prompt: trimmed,
        model: result.model,
        aspectRatio: result.aspectRatio,
        imageSize: result.imageSize,
        mode: sourceImages.length > 0 ? 'edit' : 'generate',
        imageDataUrl: result.imageDataUrl,
        caption: result.text,
        createdAtMs: Date.now(),
      };

      setSessionResults((prev) => [record, ...prev]);
      onRecordCreated(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseResultAsInput = (item: ImageCreationRecord) => {
    if (!item.imageDataUrl) return;
    const [header, base64] = item.imageDataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);/);
    const mimeType = mimeMatch?.[1] || 'image/png';

    setSourceImages([
      {
        id: `edit_${Date.now()}`,
        name: 'generated_picture.png',
        mimeType,
        data: base64 || '',
        previewUrl: item.imageDataUrl,
      },
    ]);
  };

  const handleDownload = (item: ImageCreationRecord) => {
    if (!item.imageDataUrl) return;
    const a = document.createElement('a');
    a.href = item.imageDataUrl;
    a.download = `after-ai-${item.id}.png`;
    a.click();
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-8 py-6 safe-pb">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
            Agnes AI Image Studio
          </h1>
          <p className="text-sm text-[#737373] dark:text-[#9A9A9A]">
            Generate images of anything or upload picture(s) to edit with a prompt via Agnes AI.
          </p>
        </div>

        <form
          onSubmit={handleGenerate}
          className="rounded-2xl border border-[#E5E5E5] dark:border-[#343434] bg-[#F9F9F9] dark:bg-[#2A2A2A] p-4 sm:p-6 space-y-5"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label
                htmlFor="image-model-select"
                className="block text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4]"
              >
                Image model
              </label>
              <select
                id="image-model-select"
                value={model}
                onChange={(e) => handleModelChange(e.target.value as ImageModelId)}
                className="w-full min-h-[40px] rounded-xl border border-[#E5E5E5] dark:border-[#3D3D3D] bg-white dark:bg-[#212121] px-3 py-2 text-sm text-[#0D0D0D] dark:text-[#ECECEC] focus:outline-none"
              >
                {IMAGE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-[#737373] dark:text-[#8E8E8E]">
                {activeModelMeta.tagline}
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="image-ratio-select"
                className="block text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4]"
              >
                Aspect ratio
              </label>
              <select
                id="image-ratio-select"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as ImageAspectRatio)}
                className="w-full min-h-[40px] rounded-xl border border-[#E5E5E5] dark:border-[#3D3D3D] bg-white dark:bg-[#212121] px-3 py-2 text-sm text-[#0D0D0D] dark:text-[#ECECEC] focus:outline-none"
              >
                {availableRatios.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4]">
                Resolution {activeModelMeta.supportsResolution ? '(1K / 2K / 4K)' : '(Standard)'}
              </span>
              <div className="flex items-center gap-1 p-1 rounded-xl bg-white dark:bg-[#212121] border border-[#E5E5E5] dark:border-[#3D3D3D]">
                {SIZES.map((sz) => {
                  const disabled = !activeModelMeta.supportsResolution && sz !== '1K';
                  const active = (activeModelMeta.supportsResolution ? imageSize : '1K') === sz;
                  return (
                    <button
                      key={sz}
                      type="button"
                      disabled={disabled}
                      onClick={() => setImageSize(sz)}
                      className={`flex-1 min-h-[32px] text-xs font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                        active
                          ? 'bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D]'
                          : 'text-[#737373] dark:text-[#9A9A9A] hover:text-[#0D0D0D] dark:hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4]">
                Reference picture(s) to edit (optional)
              </span>
              {sourceImages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSourceImages([])}
                  className="text-xs font-medium text-[#0D0D0D] dark:text-white underline cursor-pointer"
                >
                  Clear all
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[42px] flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-[#CCCCCC] dark:border-[#4A4A4A] bg-white dark:bg-[#212121] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] hover:border-[#0D0D0D] dark:hover:border-white transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Add picture(s) to edit</span>
              </button>

              {sourceImages.map((img) => (
                <div
                  key={img.id}
                  className="relative group w-16 h-16 rounded-xl overflow-hidden border border-[#E5E5E5] dark:border-[#3D3D3D]"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSourceImages((prev) => prev.filter((item) => item.id !== img.id))
                    }
                    aria-label={`Remove ${img.name}`}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/70 text-white cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="image-prompt-input"
              className="block text-xs font-medium text-[#5D5D5D] dark:text-[#B4B4B4]"
            >
              {sourceImages.length > 0 ? 'Edit instruction' : 'Image prompt'}
            </label>
            <textarea
              id="image-prompt-input"
              rows={3}
              maxLength={2000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                sourceImages.length > 0
                  ? 'Describe how to edit the uploaded picture(s)...'
                  : 'Describe the image you want to create...'
              }
              className="w-full rounded-xl border border-[#E5E5E5] dark:border-[#3D3D3D] bg-white dark:bg-[#212121] p-3.5 text-sm text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#8E8E8E] focus:outline-none focus:border-[#0D0D0D] dark:focus:border-white/50"
            />
          </div>

          {error && (
            <div className="px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs sm:text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#737373] dark:text-[#8E8E8E] font-mono-code">
              {sourceImages.length > 0 ? 'Edit mode' : 'Generate mode'} · {model}
            </span>

            <button
              type="submit"
              disabled={!prompt.trim() || isGenerating}
              className="min-h-[42px] inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity cursor-pointer whitespace-nowrap"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering...</span>
                </>
              ) : sourceImages.length > 0 ? (
                <>
                  <Wand2 className="w-4 h-4" />
                  <span>Edit Picture</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Image</span>
                </>
              )}
            </button>
          </div>
        </form>

        {sessionResults.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
              Created in this session
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {sessionResults.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[#E5E5E5] dark:border-[#343434] bg-[#F9F9F9] dark:bg-[#2A2A2A] overflow-hidden"
                >
                  {item.imageDataUrl ? (
                    <img
                      src={item.imageDataUrl}
                      alt={item.prompt}
                      className="w-full max-h-[420px] object-contain bg-[#EFEFEF] dark:bg-[#171717]"
                    />
                  ) : (
                    <div className="h-56 flex items-center justify-center bg-[#EFEFEF] dark:bg-[#171717] text-[#737373]">
                      <ImagePlus className="w-8 h-8" />
                    </div>
                  )}
                  <div className="p-4 space-y-3">
                    <p className="text-sm text-[#0D0D0D] dark:text-[#ECECEC] line-clamp-3">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#737373] dark:text-[#9A9A9A]">
                      <span className="font-mono-code truncate">
                        {item.model} · {item.aspectRatio} · {item.imageSize}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleUseResultAsInput(item)}
                          className="px-3 py-1.5 rounded-lg border border-[#D4D4D4] dark:border-[#444444] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(item)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 transition-opacity cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="space-y-3 pt-2">
            <h2 className="text-base font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
              Saved prompt history
            </h2>
            <div className="divide-y divide-[#E5E5E5] dark:divide-[#303030] rounded-2xl border border-[#E5E5E5] dark:border-[#343434] bg-[#F9F9F9] dark:bg-[#2A2A2A]">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[#0D0D0D] dark:text-[#ECECEC] truncate">
                      {item.prompt}
                    </p>
                    <p className="text-xs text-[#737373] dark:text-[#9A9A9A] font-mono-code mt-0.5">
                      {item.mode} · {item.model} · {item.aspectRatio} · {item.imageSize}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt(item.prompt);
                      const validModel = IMAGE_MODELS.some((m) => m.id === item.model)
                        ? item.model
                        : 'agnes-image-2.5-flash';
                      handleModelChange(validModel);
                      setAspectRatio(item.aspectRatio);
                      setImageSize(item.imageSize);
                    }}
                    className="self-start sm:self-center text-xs font-medium text-[#0D0D0D] dark:text-white underline cursor-pointer shrink-0"
                  >
                    Reuse
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
