import React, { isValidElement, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowUp,
  Square,
  Plus,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Copy,
  Check,
  SlidersHorizontal,
  X,
  Loader2,
  Image as ImageIcon,
  Download,
  Wand2,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import {
  ChatAttachment,
  ChatMessage,
  ChatModelId,
  ImageModelId,
  TtsVoiceName,
} from '../types';
import { SYSTEM_PRESETS, TTS_VOICES } from '../lib/models';
import { synthesizeSpeech, transcribeAudio } from '../lib/api';

interface ChatViewProps {
  messages: ChatMessage[];
  activeModel: ChatModelId;
  systemInstruction: string;
  onChangeSystemInstruction: (instruction: string) => void;
  isStreaming: boolean;
  onSendMessage: (payload: {
    text: string;
    attachments: ChatAttachment[];
    imageMode?: boolean;
    imageModel?: ImageModelId;
  }) => void;
  onStopStreaming: () => void;
  onRegenerate?: () => void;
  onRetryLast?: () => void;
  errorBanner: string | null;
  onDismissError: () => void;
}

const QUICK_CHIPS: Array<{
  label: string;
  prompt: string;
  imageMode?: boolean;
}> = [
  {
    label: 'Create image',
    prompt: 'Create a cinematic photorealistic studio shot of a futuristic smartwatch on dark slate.',
    imageMode: true,
  },
  {
    label: 'Write clean code',
    prompt: 'Write clean, well-structured TypeScript code for a ',
  },
  {
    label: 'Analyze images',
    prompt: 'Explain everything in this image in clear, structured detail.',
  },
  {
    label: 'Summarize & structure',
    prompt: 'Summarize the key ideas clearly into bullet points with actionable takeaways.',
  },
];

function extractTextFromNode(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return extractTextFromNode(node.props.children);
  }
  return '';
}

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  activeModel,
  systemInstruction,
  onChangeSystemInstruction,
  isStreaming,
  onSendMessage,
  onStopStreaming,
  onRegenerate,
  onRetryLast,
  errorBanner,
  onDismissError,
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [imageMode, setImageMode] = useState(false);
  const [imageModel, setImageModel] = useState<ImageModelId>('agnes-image-2.5-flash');

  const [systemModalOpen, setSystemModalOpen] = useState(false);
  const [draftSystem, setDraftSystem] = useState(systemInstruction);

  // Mic audio transcription state (gemini-3.5-transcribe)
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // TTS playback state (gemini-3.8-flash-tts)
  const [ttsVoice, setTtsVoice] = useState<TtsVoiceName>('Kore');
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [loadingTtsId, setLoadingTtsId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraftSystem(systemInstruction);
  }, [systemInstruction]);

  const lastMessageContent = messages[messages.length - 1]?.content ?? '';

  useEffect(() => {
    if (!userScrolledUpRef.current) {
      scrollEndRef.current?.scrollIntoView({
        behavior: isStreaming ? 'auto' : 'smooth',
      });
    }
  }, [messages.length, lastMessageContent, isStreaming]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  useEffect(() => {
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
    };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setLocalError(null);

    const newItems: ChatAttachment[] = [];
    for (const file of files.slice(0, 4)) {
      if (file.size > 20 * 1024 * 1024) {
        setLocalError(`"${file.name}" exceeds the 20MB attachment limit.`);
        continue;
      }
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      const isAud = file.type.startsWith('audio/');
      if (!isImg && !isVid && !isAud) {
        setLocalError(`Unsupported file type for "${file.name}". Please upload image, video, or audio.`);
        continue;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const base64 = dataUrl.split(',')[1] || '';
      newItems.push({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mimeType: file.type,
        data: base64,
        previewUrl: dataUrl,
        kind: isVid ? 'video' : isAud ? 'audio' : 'image',
      });
    }

    setAttachments((prev) => [...prev, ...newItems].slice(0, 4));
    e.target.value = '';
  };

  const toggleRecording = async () => {
    setLocalError(null);
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size === 0) return;

        setIsTranscribing(true);
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
            reader.onerror = () => reject(new Error('Failed to encode audio'));
            reader.readAsDataURL(blob);
          });
          const transcript = await transcribeAudio({ audioData: base64, mimeType });
          if (transcript) {
            setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (err) {
          setLocalError(err instanceof Error ? err.message : 'Transcription failed.');
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch {
      setLocalError('Microphone permission denied or unavailable.');
    }
  };

  const handlePlayTts = async (msgId: string, text: string) => {
    if (playingMessageId === msgId) {
      audioPlayerRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
      setPlayingMessageId(null);
    }

    setLocalError(null);
    setLoadingTtsId(msgId);
    try {
      const { audioBase64, mimeType } = await synthesizeSpeech({
        text,
        voiceName: ttsVoice,
      });
      const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
      audioPlayerRef.current = audio;
      audio.onended = () => setPlayingMessageId(null);
      audio.onerror = () => {
        setPlayingMessageId(null);
        setLocalError('Unable to play synthesized audio.');
      };
      await audio.play();
      setPlayingMessageId(msgId);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'TTS playback failed.');
    } finally {
      setLoadingTtsId(null);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const handleEditImageInNextTurn = (dataUrl: string) => {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    setAttachments([
      {
        id: `edit_${Date.now()}`,
        name: 'picture_to_edit.png',
        mimeType,
        data: base64 || '',
        previewUrl: dataUrl,
        kind: 'image',
      },
    ]);
    setImageMode(true);
    textareaRef.current?.focus();
  };

  const handleDownloadImage = (dataUrl: string, id: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `after-ai-${id}.png`;
    a.click();
  };

  const submitPrompt = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;

    const currentAttachments = [...attachments];
    userScrolledUpRef.current = false;
    setInputText('');
    setAttachments([]);
    setLocalError(null);

    onSendMessage({
      text:
        trimmed ||
        (imageMode
          ? 'Enhance and refine this picture cleanly.'
          : 'Please analyze the attached media.'),
      attachments: currentAttachments,
      imageMode,
      imageModel,
    });
  };

  const handleChatScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUpRef.current = distanceFromBottom > 96;
  };

  const handleCopyCodeBlock = async (codeKey: string, codeText: string) => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopiedCodeKey(codeKey);
      setTimeout(() => setCopiedCodeKey((curr) => (curr === codeKey ? null : curr)), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  const composer = (
    <div className="w-full max-w-3xl mx-auto">
      {(errorBanner || localError) && (
        <div className="mb-2.5 flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl border border-red-500/30 bg-red-500/10 text-xs sm:text-sm text-red-700 dark:text-red-300">
          <span className="leading-relaxed flex-1 min-w-0">{localError || errorBanner}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {errorBanner && !localError && onRetryLast && !isStreaming && (
              <button
                type="button"
                onClick={() => {
                  userScrolledUpRef.current = false;
                  onRetryLast();
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onDismissError();
              }}
              className="p-1 rounded-lg hover:bg-black/10 cursor-pointer shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-[26px] border border-[#E5E5E5] dark:border-[#383838] bg-[#F4F4F4] dark:bg-[#2F2F2F] transition-colors focus-within:border-[#CCCCCC] dark:focus-within:border-[#525252]">
        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative flex items-center gap-2 pr-7 pl-2 py-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-[#212121]"
              >
                {att.kind === 'image' ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-semibold uppercase text-[#0D0D0D] dark:text-white">
                    {att.kind}
                  </span>
                )}
                <span className="text-xs text-[#333333] dark:text-[#E0E0E0] max-w-[130px] truncate">
                  {att.name}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setAttachments((prev) => prev.filter((a) => a.id !== att.id))
                  }
                  aria-label={`Remove ${att.name}`}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#737373] hover:text-red-500 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submitPrompt();
            }
          }}
          placeholder={
            imageMode
              ? attachments.length > 0
                ? 'Describe how Agnes AI should edit this picture...'
                : 'Describe an image of anything for Agnes AI to create...'
              : 'Ask anything'
          }
          className="w-full resize-none bg-transparent px-4 sm:px-5 pt-3.5 pb-1.5 text-[15px] leading-relaxed text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#737373] dark:placeholder-[#9A9A9A] focus:outline-none max-h-[180px]"
        />

        {/* Bottom Composer Controls */}
        <div className="flex items-center justify-between gap-1.5 px-2.5 sm:px-3 pb-2.5 pt-1">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach picture, video, or audio"
              className="min-w-[38px] min-h-[38px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-full text-[#4A4A4A] dark:text-[#D4D4D4] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Attach photo or video"
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setImageMode((prev) => !prev)}
              title="Generate or edit images in chat using Agnes AI"
              className={`min-h-[36px] flex items-center gap-1.5 px-3 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                imageMode
                  ? 'bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D]'
                  : 'text-[#4A4A4A] dark:text-[#D4D4D4] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Agnes Image</span>
            </button>

            {imageMode && (
              <select
                aria-label="Agnes AI image model version"
                value={imageModel}
                onChange={(e) => setImageModel(e.target.value as ImageModelId)}
                className="min-h-[34px] px-2.5 rounded-full text-xs font-medium bg-white dark:bg-[#212121] border border-black/10 dark:border-white/15 text-[#0D0D0D] dark:text-[#ECECEC] focus:outline-none shrink-0"
              >
                <option value="agnes-image-2.5-flash">2.5 Flash</option>
                <option value="agnes-image-2.1-flash">2.1 Flash</option>
                <option value="agnes-image-2.0-flash">2.0 Flash</option>
              </select>
            )}

            <button
              type="button"
              onClick={() => setSystemModalOpen(true)}
              title="Assistant system instructions & TTS voice"
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-full text-[#4A4A4A] dark:text-[#D4D4D4] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
              aria-label="Role and voice settings"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Right side: Mic dictate + Send/Stop */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={toggleRecording}
              disabled={isTranscribing}
              title={
                isRecording
                  ? 'Stop recording and transcribe'
                  : 'Dictate via microphone (Gemini 3.5 Transcribe)'
              }
              aria-label="Dictate message"
              className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-red-500 text-white'
                  : 'text-[#4A4A4A] dark:text-[#D4D4D4] hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              {isTranscribing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>

            {isStreaming ? (
              <button
                type="button"
                onClick={onStopStreaming}
                aria-label="Stop response"
                className="min-w-[38px] min-h-[38px] rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] flex items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submitPrompt}
                disabled={!inputText.trim() && attachments.length === 0}
                aria-label="Send message"
                className="min-w-[38px] min-h-[38px] rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] flex items-center justify-center hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity cursor-pointer"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {messages.length === 0 ? (
        /* Empty ChatGPT-clone centered view */
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-6 py-8">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0D0D0D] dark:text-[#ECECEC] text-balance">
                What can I help with?
              </h1>
              <p className="text-xs sm:text-sm text-[#737373] dark:text-[#8E8E8E]">
                After AI by Hassnain Akhtar · CEO of HA Developers
              </p>
            </div>

            {composer}

            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setImageMode(Boolean(chip.imageMode));
                    setInputText(chip.prompt);
                    textareaRef.current?.focus();
                  }}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-medium border border-[#E5E5E5] dark:border-[#363636] bg-white dark:bg-[#212121] text-[#4A4A4A] dark:text-[#D4D4D4] hover:bg-[#F4F4F4] dark:hover:bg-[#2C2C2C] transition-colors cursor-pointer whitespace-nowrap"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Active scrollable chat turn thread */
        <>
          <div
            ref={scrollContainerRef}
            onScroll={handleChatScroll}
            className="flex-1 overflow-y-auto px-3 sm:px-6 py-5"
          >
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, msgIndex) => {
                const isUser = msg.role === 'user';
                const isLastAssistant = !isUser && msgIndex === messages.length - 1;
                let codeBlockIdx = 0;

                return (
                  <div
                    key={msg.id}
                    className={
                      isUser ? 'flex justify-end group' : 'flex items-start gap-3 sm:gap-3.5'
                    }
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-full border border-[#E5E5E5] dark:border-[#383838] bg-white dark:bg-[#2A2A2A] flex items-center justify-center shrink-0 mt-0.5">
                        <svg
                          viewBox="0 0 24 24"
                          className="w-3.5 h-3.5 text-[#0D0D0D] dark:text-white"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                        >
                          <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
                        </svg>
                      </div>
                    )}

                    {isUser ? (
                      <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-end gap-1">
                        <div className="w-full rounded-3xl px-4 py-2.5 bg-[#F4F4F4] dark:bg-[#2F2F2F] text-[#0D0D0D] dark:text-[#ECECEC]">
                          {msg.localAttachments && msg.localAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                              {msg.localAttachments.map((att) =>
                                att.kind === 'image' ? (
                                  <img
                                    key={att.id}
                                    src={att.previewUrl}
                                    alt={att.name}
                                    className="max-h-48 rounded-xl object-cover border border-black/10"
                                  />
                                ) : (
                                  <div
                                    key={att.id}
                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/10"
                                  >
                                    {att.kind.toUpperCase()}: {att.name}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {!msg.localAttachments?.length && msg.attachmentLabel && (
                            <p className="text-xs text-[#737373] dark:text-[#A4A4A4] mb-1">
                              {msg.attachmentLabel}
                            </p>
                          )}
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        </div>

                        {msg.content && !isStreaming && (
                          <button
                            type="button"
                            onClick={() => {
                              setInputText(msg.content);
                              textareaRef.current?.focus();
                            }}
                            title="Edit or reuse prompt"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] text-[#737373] dark:text-[#9A9A9A] hover:text-[#0D0D0D] dark:hover:text-white opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Edit</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="text-xs text-[#737373] dark:text-[#8E8E8E] flex items-center gap-1.5">
                          <span className="font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                            After AI
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono-code">{msg.model}</span>
                        </div>

                        {msg.generatedImageUrl && (
                          <div className="rounded-2xl overflow-hidden border border-[#E5E5E5] dark:border-[#363636] bg-[#F9F9F9] dark:bg-[#171717] max-w-md">
                            <img
                              src={msg.generatedImageUrl}
                              alt={msg.content || 'Generated by Agnes AI'}
                              className="w-full h-auto object-contain max-h-[420px]"
                            />
                            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-[#E5E5E5] dark:border-[#2C2C2C]">
                              <button
                                type="button"
                                onClick={() =>
                                  handleEditImageInNextTurn(msg.generatedImageUrl!)
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                              >
                                <Wand2 className="w-3.5 h-3.5" />
                                <span>Edit in chat</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadImage(msg.generatedImageUrl!, msg.id)
                                }
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 transition-opacity cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Save</span>
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="after-prose text-[#0D0D0D] dark:text-[#ECECEC]">
                          {msg.content ? (
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                pre({ children }) {
                                  const blockKey = `${msg.id}_code_${codeBlockIdx++}`;
                                  let lang = 'code';
                                  if (isValidElement<{ className?: string }>(children)) {
                                    const match = /language-([\w-]+)/.exec(
                                      children.props.className || ''
                                    );
                                    if (match?.[1]) lang = match[1];
                                  }
                                  const rawCode = extractTextFromNode(children).replace(/\n$/, '');
                                  const isCodeCopied = copiedCodeKey === blockKey;
                                  return (
                                    <div className="my-3.5 rounded-xl overflow-hidden border border-black/10 dark:border-white/10 bg-[#171717]">
                                      <div className="flex items-center justify-between gap-2 px-3.5 py-2 bg-[#222222] border-b border-white/10 text-[11px] text-[#B4B4B4]">
                                        <span className="font-mono-code lowercase tracking-wide">
                                          {lang}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleCopyCodeBlock(blockKey, rawCode)}
                                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-white/10 text-[#E5E5E5] transition-colors cursor-pointer"
                                        >
                                          {isCodeCopied ? (
                                            <>
                                              <Check className="w-3 h-3 text-emerald-400" />
                                              <span>Copied</span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3 h-3" />
                                              <span>Copy code</span>
                                            </>
                                          )}
                                        </button>
                                      </div>
                                      <pre className="m-0! rounded-none! border-0! bg-transparent! px-4! py-3.5! overflow-x-auto text-[13px] leading-relaxed font-mono-code text-[#F3F3F3]">
                                        {children}
                                      </pre>
                                    </div>
                                  );
                                },
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          ) : !msg.generatedImageUrl ? (
                            <span className="inline-flex items-center gap-2 text-sm text-[#737373]">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Thinking...
                            </span>
                          ) : null}
                        </div>

                        {msg.content && (
                          <div className="flex flex-wrap items-center gap-3 pt-0.5">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="inline-flex items-center gap-1.5 min-h-[32px] text-xs text-[#737373] dark:text-[#9A9A9A] hover:text-[#0D0D0D] dark:hover:text-white transition-colors cursor-pointer"
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handlePlayTts(msg.id, msg.content)}
                              disabled={loadingTtsId === msg.id}
                              className="inline-flex items-center gap-1.5 min-h-[32px] text-xs text-[#737373] dark:text-[#9A9A9A] hover:text-[#0D0D0D] dark:hover:text-white transition-colors cursor-pointer"
                            >
                              {loadingTtsId === msg.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Loading audio</span>
                                </>
                              ) : playingMessageId === msg.id ? (
                                <>
                                  <VolumeX className="w-3.5 h-3.5" />
                                  <span>Stop</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Read aloud</span>
                                </>
                              )}
                            </button>

                            {isLastAssistant && !isStreaming && onRegenerate && (
                              <button
                                type="button"
                                onClick={() => {
                                  userScrolledUpRef.current = false;
                                  onRegenerate();
                                }}
                                className="inline-flex items-center gap-1.5 min-h-[32px] text-xs text-[#737373] dark:text-[#9A9A9A] hover:text-[#0D0D0D] dark:hover:text-white transition-colors cursor-pointer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Regenerate</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={scrollEndRef} />
            </div>
          </div>

          <div className="px-3 sm:px-6 pt-2 safe-pb bg-white dark:bg-[#212121]">
            {composer}
            <p className="text-center text-[11px] text-[#8E8E8E] mt-2">
              After AI by Hassnain Akhtar · CEO of HA Developers · {activeModel}
            </p>
          </div>
        </>
      )}

      {/* System Instruction & TTS Voice Modal */}
      {systemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="max-w-lg w-full rounded-2xl border border-[#E5E5E5] dark:border-[#363636] bg-white dark:bg-[#212121] p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                Assistant Role & Voice
              </h2>
              <button
                type="button"
                onClick={() => setSystemModalOpen(false)}
                className="p-1.5 rounded-lg text-[#737373] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                aria-label="Close settings"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#5D5D5D] dark:text-[#A4A4A4]">
                Quick presets
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SYSTEM_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDraftSystem(preset.instruction)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E5E5] dark:border-[#363636] bg-[#F9F9F9] dark:bg-[#2A2A2A] text-[#0D0D0D] dark:text-[#ECECEC] hover:border-[#0D0D0D] dark:hover:border-white/50 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="system-instruction-input"
                className="block text-xs font-medium text-[#5D5D5D] dark:text-[#A4A4A4]"
              >
                System instruction
              </label>
              <textarea
                id="system-instruction-input"
                rows={4}
                maxLength={2000}
                value={draftSystem}
                onChange={(e) => setDraftSystem(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] dark:border-[#363636] bg-[#F9F9F9] dark:bg-[#171717] p-3 text-sm text-[#0D0D0D] dark:text-[#ECECEC] focus:outline-none focus:border-[#0D0D0D] dark:focus:border-white/50"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="tts-voice-select"
                className="block text-xs font-medium text-[#5D5D5D] dark:text-[#A4A4A4]"
              >
                Read Aloud voice (Gemini 3.8 Flash TTS)
              </label>
              <select
                id="tts-voice-select"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value as TtsVoiceName)}
                className="w-full rounded-xl border border-[#E5E5E5] dark:border-[#363636] bg-[#F9F9F9] dark:bg-[#171717] px-3 py-2 text-sm text-[#0D0D0D] dark:text-[#ECECEC] focus:outline-none"
              >
                {TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} — {v.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSystemModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#5D5D5D] dark:text-[#A4A4A4] hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeSystemInstruction(draftSystem);
                  setSystemModalOpen(false);
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 cursor-pointer"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
