export type ChatModelId =
  | 'gemini-4-hydrogen'
  | 'gemini-3.1-flash-lite'
  | 'gemini-4-carbon'
  | 'gemini-4-neon';

export type ImageModelId =
  | 'agnes-image-2.5-flash'
  | 'agnes-image-2.1-flash'
  | 'agnes-image-2.0-flash';

export type ImageAspectRatio =
  | '1:1'
  | '3:4'
  | '4:3'
  | '9:16'
  | '16:9'
  | '1:4'
  | '1:8'
  | '4:1'
  | '8:1';

export type ImageSizeOption = '1K' | '2K' | '4K';

export type WorkspaceTab = 'chat' | 'agent' | 'images';

export type AgentCategory = 'auto' | 'app' | 'website';

export type TtsVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export interface MapsLinkItem {
  title: string;
  uri: string;
  reviewSnippet?: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 without data URL prefix
  previewUrl: string;
  kind: 'image' | 'video' | 'audio';
}

export interface ChatMessage {
  id: string;
  userId?: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  model: string;
  thinkingUsed: boolean;
  mapsLinks?: MapsLinkItem[];
  attachmentLabel?: string;
  localAttachments?: ChatAttachment[];
  generatedImageUrl?: string;
  createdAtMs: number;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  model: ChatModelId;
  systemInstruction: string;
  messageCount: number;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface ImageCreationRecord {
  id: string;
  userId?: string;
  prompt: string;
  model: ImageModelId;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSizeOption;
  mode: 'generate' | 'edit';
  imageDataUrl?: string;
  caption?: string;
  createdAtMs: number;
}

export interface AgentTurn {
  id: string;
  role: 'user' | 'assistant';
  prompt: string;
  summary: string;
  htmlCode?: string;
  artifactTitle?: string;
  category: AgentCategory;
  model: string;
  status: 'streaming' | 'completed' | 'error';
  createdAtMs: number;
}

export interface AgentArtifactRecord {
  id: string;
  userId?: string;
  title: string;
  category: AgentCategory;
  prompt: string;
  summary: string;
  html: string;
  model: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
  preferredModel: ChatModelId;
  theme: 'light' | 'dark';
}
