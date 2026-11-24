import {
  AgentCategory,
  ChatAttachment,
  ChatModelId,
  ImageAspectRatio,
  ImageModelId,
  ImageSizeOption,
  TtsVoiceName,
} from '../types';

export interface StreamChatParams {
  model: ChatModelId;
  messages: Array<{
    role: 'user' | 'assistant';
    text: string;
    attachments?: ChatAttachment[];
  }>;
  systemInstruction?: string;
  signal?: AbortSignal;
  onMeta?: (meta: { modelUsed: string; thinkingUsed: boolean }) => void;
  onChunk: (text: string) => void;
}

export async function streamChatResponse(params: StreamChatParams): Promise<void> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      messages: params.messages.map((m) => ({
        role: m.role,
        text: m.text,
        attachments: m.attachments?.map((a) => ({
          mimeType: a.mimeType,
          data: a.data,
        })),
      })),
      systemInstruction: params.systemInstruction,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => 'Failed to connect to AI stream.');
    throw new Error(errText || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = (block: string) => {
    const trimmed = block.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) return;

    const parsed = JSON.parse(jsonStr) as {
      type: 'meta' | 'chunk' | 'done' | 'error';
      text?: string;
      modelUsed?: string;
      thinkingUsed?: boolean;
      error?: string;
    };

    if (parsed.type === 'meta' && parsed.modelUsed) {
      params.onMeta?.({
        modelUsed: parsed.modelUsed,
        thinkingUsed: Boolean(parsed.thinkingUsed),
      });
    } else if (parsed.type === 'chunk' && parsed.text) {
      params.onChunk(parsed.text);
    } else if (parsed.type === 'error') {
      throw new Error(parsed.error || 'AI generation failed.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n\r?\n/);
    buffer = lines.pop() ?? '';

    for (const block of lines) {
      processBlock(block);
    }
  }

  if (buffer.trim()) {
    processBlock(buffer);
  }
}

export async function generateOrEditImage(params: {
  prompt: string;
  model: ImageModelId;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeOption;
  images?: Array<{ mimeType: string; data: string }>;
}): Promise<{
  imageDataUrl: string;
  text: string;
  model: ImageModelId;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeOption;
}> {
  const res = await fetch('/api/images/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Image generation failed.');
  }
  return data;
}

export async function transcribeAudio(params: {
  audioData: string;
  mimeType: string;
}): Promise<string> {
  const res = await fetch('/api/audio/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Audio transcription failed.');
  }
  return data.text || '';
}

export async function synthesizeSpeech(params: {
  text: string;
  voiceName: TtsVoiceName;
  style?: string;
}): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch('/api/audio/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Speech synthesis failed.');
  }
  return data;
}

export interface StreamAgentParams {
  model: ChatModelId;
  category: AgentCategory;
  prompt: string;
  currentHtml?: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  signal?: AbortSignal;
  onMeta?: (meta: { modelUsed: string }) => void;
  onChunk: (text: string) => void;
}

export async function streamAgentResponse(params: StreamAgentParams): Promise<void> {
  const response = await fetch('/api/agent/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: params.signal,
    body: JSON.stringify({
      model: params.model,
      category: params.category,
      prompt: params.prompt,
      currentHtml: params.currentHtml,
      history: params.history,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text().catch(() => 'Failed to connect to Agent stream.');
    throw new Error(errText || `HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = (block: string) => {
    const trimmed = block.trim();
    if (!trimmed.startsWith('data:')) return;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr) return;

    const parsed = JSON.parse(jsonStr) as {
      type: 'meta' | 'chunk' | 'done' | 'error';
      text?: string;
      modelUsed?: string;
      error?: string;
    };

    if (parsed.type === 'meta' && parsed.modelUsed) {
      params.onMeta?.({ modelUsed: parsed.modelUsed });
    } else if (parsed.type === 'chunk' && parsed.text) {
      params.onChunk(parsed.text);
    } else if (parsed.type === 'error') {
      throw new Error(parsed.error || 'Agent generation failed.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n\r?\n/);
    buffer = lines.pop() ?? '';

    for (const block of lines) {
      processBlock(block);
    }
  }

  if (buffer.trim()) {
    processBlock(buffer);
  }
}
