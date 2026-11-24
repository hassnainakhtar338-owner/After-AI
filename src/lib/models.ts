import { ChatModelId, ImageModelId, TtsVoiceName } from '../types';

export interface ChatModelInfo {
  id: ChatModelId;
  label: string;
  tagline: string;
  freeTier: boolean;
}

export const CHAT_MODELS: ChatModelInfo[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tagline: 'Default · Chat, Vision, Audio & Video (Free Tier)',
    freeTier: true,
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tagline: 'Ultra-fast low latency replies (Free Tier)',
    freeTier: true,
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    tagline: 'Deep reasoning · High Thinking (Paid Key)',
    freeTier: false,
  },
  {
    id: 'gemini-4-neon',
    label: 'Gemini 4 Neon',
    tagline: 'Complex interactive reasoning (Paid Key)',
    freeTier: false,
  },
];

export interface ImageModelInfo {
  id: ImageModelId;
  label: string;
  tagline: string;
  supportsResolution: boolean;
  supportsExtendedRatios: boolean;
}

export const IMAGE_MODELS: ImageModelInfo[] = [
  {
    id: 'agnes-image-2.5-flash',
    label: 'Agnes Image 2.5 Flash',
    tagline: 'Latest · Text-to-image & prompt picture editing',
    supportsResolution: true,
    supportsExtendedRatios: false,
  },
  {
    id: 'agnes-image-2.1-flash',
    label: 'Agnes Image 2.1 Flash',
    tagline: 'High-detail image generation & multi-image editing',
    supportsResolution: true,
    supportsExtendedRatios: false,
  },
  {
    id: 'agnes-image-2.0-flash',
    label: 'Agnes Image 2.0 Flash',
    tagline: 'Ultra-fast lightweight image creation & edits',
    supportsResolution: false,
    supportsExtendedRatios: false,
  },
];

export const TTS_VOICES: { id: TtsVoiceName; description: string }[] = [
  { id: 'Kore', description: 'Warm, poised narrator' },
  { id: 'Zephyr', description: 'Crisp, conversational' },
  { id: 'Puck', description: 'Bright, expressive' },
  { id: 'Charon', description: 'Deep, measured' },
  { id: 'Fenrir', description: 'Rich, authoritative' },
];

export const SYSTEM_PRESETS: { label: string; instruction: string }[] = [
  {
    label: 'After AI Default',
    instruction:
      'You are After AI, a thoughtful, precise, and deeply capable AI assistant created by Hassnain Akhtar, CEO of HA Developers. Write with clarity, warmth, and structured depth. Format complex explanations cleanly with Markdown.',
  },
  {
    label: 'Senior Software Architect',
    instruction:
      'You are After AI acting as a Principal Software Architect. Provide clean, production-grade TypeScript/React/backend architectures, pinpoint edge cases, and write concise, secure code.',
  },
  {
    label: 'Editorial Writer',
    instruction:
      'You are After AI acting as a literary editor and strategist. Craft lucid, human prose with strong structure, zero filler, and clear narrative flow.',
  },
  {
    label: 'Research & Strategy Analyst',
    instruction:
      'You are After AI acting as a research analyst. Break down complex topics from first principles, highlight assumptions explicitly, and present structured takeaways.',
  },
];
