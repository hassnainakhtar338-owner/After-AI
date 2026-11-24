import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const CHAT_MODELS = new Set([
  'gemini-4-hydrogen',
  'gemini-4-carbon',
  'gemini-4-neon',
  'gemini-3.1-flash-lite',
]);

const IMAGE_MODELS = new Set([
  'agnes-image-2.5-flash',
  'agnes-image-2.1-flash',
  'agnes-image-2.0-flash',
]);

const STANDARD_ASPECT_RATIOS = new Set(['1:1', '3:4', '4:3', '9:16', '16:9']);
const IMAGE_SIZES = new Set(['1K', '2K', '4K']);
const TTS_VOICES = new Set(['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr']);

function resolveAgnesDimensions(aspectRatio: string, imageSize: string): string {
  const highRes = imageSize === '2K' || imageSize === '4K';
  switch (aspectRatio) {
    case '3:4':
      return highRes ? '1152x1536' : '768x1024';
    case '4:3':
      return highRes ? '1536x1152' : '1024x768';
    case '9:16':
      return highRes ? '1080x1920' : '720x1280';
    case '16:9':
      return highRes ? '1920x1080' : '1280x720';
    case '1:1':
    default:
      return highRes ? '1536x1536' : '1024x1024';
  }
}

const ALLOWED_MEDIA_MIME_PREFIXES = ['image/', 'video/', 'audio/'];

const DEFAULT_SYSTEM_INSTRUCTION =
  'You are After AI, a deeply capable, precise, and thoughtful AI assistant created by Hassnain Akhtar, CEO of HA Developers. Answer directly without filler, structure explanations clearly with Markdown headings, lists, tables, and fenced code blocks with language identifiers when helpful, and prioritize accuracy and practical clarity.';

function createAiClient(attempts = 1): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
      retryOptions: {
        attempts,
      },
    },
  });
}

function extractReadableMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed?.error === 'string') return extractReadableMessage(parsed.error);
    if (parsed?.error && typeof parsed.error === 'object' && parsed.error.message) {
      return extractReadableMessage(parsed.error.message);
    }
    if (typeof parsed?.message === 'string') return parsed.message;
  } catch {
    // Not JSON
  }
  return raw;
}

function formatGeminiError(
  error: unknown,
  _context: 'chat' | 'audio' = 'chat'
): { status: number; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const readable = extractReadableMessage(raw);
  if (raw.includes('GEMINI_API_KEY is not configured')) {
    return { status: 500, message: readable };
  }
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return {
      status: 403,
      message:
        'Gemini API access denied or key invalid. Please verify your API key in Settings > Secrets.',
    };
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return {
      status: 429,
      message:
        'Quota limit reached for this model or feature on the current API key. For free-tier chat, use Gemini 4 Hydrogen / Flash Lite, or add a billing-enabled key in Settings > Secrets.',
    };
  }
  if (raw.includes('503') || raw.includes('UNAVAILABLE')) {
    return {
      status: 503,
      message:
        'The Gemini service is experiencing a temporary spike in demand. Please try sending your message again in a moment.',
    };
  }
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return {
      status: 404,
      message: `Requested Gemini model could not be found: ${readable}`,
    };
  }
  return { status: 500, message: readable || 'An unexpected AI service error occurred.' };
}

function isTransientError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error);
  return (
    raw.includes('503') ||
    raw.includes('UNAVAILABLE') ||
    raw.includes('500') ||
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.includes('404') ||
    raw.includes('NOT_FOUND') ||
    raw.includes('AbortError') ||
    raw.includes('aborted')
  );
}

function isAllowedMime(mime: unknown): mime is string {
  return (
    typeof mime === 'string' &&
    mime.length <= 100 &&
    ALLOWED_MEDIA_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))
  );
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'After AI' });
  });

  // 1. Streaming Multi-Turn Chat + Vision/Video (Free-tier friendly via gemini-4-hydrogen)
  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const {
        model: requestedModel,
        messages,
        systemInstruction,
      } = req.body ?? {};

      if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) {
        sendEvent({ type: 'error', error: 'Invalid conversation history.' });
        if (!res.writableEnded) res.end();
        return;
      }

      const activeModel =
        typeof requestedModel === 'string' && CHAT_MODELS.has(requestedModel)
          ? requestedModel
          : 'gemini-4-hydrogen';

      const contents = messages.map(
        (m: {
          role?: string;
          text?: string;
          attachments?: Array<{ mimeType?: string; data?: string }>;
        }) => {
          const role = m?.role === 'assistant' ? 'model' : 'user';
          const parts: Array<
            { text: string } | { inlineData: { mimeType: string; data: string } }
          > = [];

          if (Array.isArray(m?.attachments)) {
            for (const att of m.attachments.slice(0, 6)) {
              if (
                att &&
                isAllowedMime(att.mimeType) &&
                typeof att.data === 'string' &&
                att.data.length > 0 &&
                att.data.length <= 35_000_000
              ) {
                parts.push({
                  inlineData: {
                    mimeType: att.mimeType,
                    data: att.data,
                  },
                });
              }
            }
          }

          const textStr = typeof m?.text === 'string' ? m.text.slice(0, 60000) : '';
          if (textStr || parts.length === 0) {
            parts.push({ text: textStr || 'Analyze the attached media.' });
          }

          return { role, parts };
        }
      );

      const cleanSystem =
        typeof systemInstruction === 'string' && systemInstruction.trim().length > 0
          ? systemInstruction.trim().slice(0, 2000)
          : DEFAULT_SYSTEM_INSTRUCTION;

      const config: Record<string, unknown> = {
        systemInstruction: cleanSystem,
      };

      // High Thinking on gemini-4-carbon (do NOT set maxOutputTokens)
      if (activeModel === 'gemini-4-carbon') {
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.HIGH,
        };
      }

      const ai = createAiClient(1);
      const modelsToTry =
        activeModel === 'gemini-4-hydrogen'
          ? [
              'gemini-4-hydrogen',
              'gemini-3.1-flash-lite',
              'gemini-3.7-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
            ]
          : activeModel === 'gemini-3.1-flash-lite'
          ? [
              'gemini-3.1-flash-lite',
              'gemini-3.7-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
              'gemini-4-hydrogen',
            ]
          : [activeModel];

      let lastErr: unknown = null;
      let streamCompleted = false;

      for (let i = 0; i < modelsToTry.length; i++) {
        const candidateModel = modelsToTry[i];
        if (clientClosed) break;
        const hasFallbackRemaining = i < modelsToTry.length - 1;
        const connectController = new AbortController();
        const timeoutMs = hasFallbackRemaining ? 4000 : 25000;
        const timer = setTimeout(() => connectController.abort(), timeoutMs);
        let emittedAnyText = false;
        let sentMeta = false;

        try {
          const stream = await ai.models.generateContentStream({
            model: candidateModel,
            contents,
            config: {
              ...config,
              abortSignal: connectController.signal,
            },
          });
          clearTimeout(timer);

          for await (const chunk of stream) {
            if (clientClosed) break;
            if (!sentMeta) {
              sentMeta = true;
              sendEvent({
                type: 'meta',
                modelUsed: candidateModel,
                thinkingUsed: candidateModel === 'gemini-4-carbon',
              });
            }
            if (chunk.text) {
              emittedAnyText = true;
              sendEvent({ type: 'chunk', text: chunk.text });
            }
          }

          if (!sentMeta && !clientClosed) {
            sendEvent({
              type: 'meta',
              modelUsed: candidateModel,
              thinkingUsed: candidateModel === 'gemini-4-carbon',
            });
          }

          streamCompleted = true;
          break;
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          if (!emittedAnyText && hasFallbackRemaining && isTransientError(err)) {
            continue;
          }
          if (emittedAnyText && isTransientError(err)) {
            // Partial response already streamed cleanly; end gracefully rather than discarding or failing.
            streamCompleted = true;
            break;
          }
          throw err;
        }
      }

      if (!streamCompleted && !clientClosed) {
        throw lastErr ?? new Error('Unable to connect to Gemini stream.');
      }

      sendEvent({ type: 'done' });
      if (!res.writableEnded) res.end();
    } catch (err) {
      const formatted = formatGeminiError(err, 'chat');
      sendEvent({ type: 'error', error: formatted.message });
      if (!res.writableEnded) res.end();
    }
  });

  // 1b. Coding Agent Stream (Web Apps & Responsive Websites -> Self-Contained Interactive HTML)
  app.post('/api/agent/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let clientClosed = false;
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    const sendEvent = (payload: Record<string, unknown>) => {
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    };

    try {
      const { model: requestedModel, category, prompt, currentHtml, history } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 8000) {
        sendEvent({ type: 'error', error: 'Please provide a valid prompt (1–8000 characters).' });
        if (!res.writableEnded) res.end();
        return;
      }

      const activeModel =
        typeof requestedModel === 'string' && CHAT_MODELS.has(requestedModel)
          ? requestedModel
          : 'gemini-4-hydrogen';

      const safeCategory =
        category === 'app' || category === 'website' ? category : 'auto';

      const categoryGuidance =
        safeCategory === 'website'
          ? 'Build a refined, responsive, studio-grade multi-section website with balanced desktop and mobile layout, clean editorial typography, subtle CSS transitions, interactive navigation/tabs/filters/modals, working contact or inquiry form feedback, and crisp inline SVG visuals.'
          : safeCategory === 'app'
          ? 'Build a complete, interactive, production-quality web application with real working client-side state, responsive desktop & mobile layout, clean forms and filters, localStorage persistence, inline SVG charts/icons where helpful, and zero placeholder stubs.'
          : 'Automatically determine whether the request is best served as an interactive web application, dashboard/utility tool, or a full responsive multi-section website, and craft it to an exceptional, production-ready standard.';

      const agentSystemInstruction = [
        'You are After AI Agent, a principal frontend software architect & UI engineer created by Hassnain Akhtar, CEO of HA Developers.',
        categoryGuidance,
        'Engineering & Visual Standards:',
        '- Craft cohesive, modern visual hierarchy using CSS custom properties, Flexbox/Grid, fluid spacing, WCAG-accessible contrast, crisp system/geometric font stacks, and smooth micro-interactions.',
        '- Wrap all DOM logic safely inside DOMContentLoaded with defensive event handling so every button, tab, search input, modal, and export action works reliably with zero console errors.',
        '- Support both mobile touchscreens (360px+) and wide desktop screens cleanly without horizontal overflow.',
        'Output format rules (STRICT):',
        '1. Write a concise 2–3 bullet architectural summary explaining what you built or updated.',
        '2. Immediately follow with ONE complete, self-contained HTML5 document inside a single ```html ... ``` code block starting with <!DOCTYPE html> and ending with </html>.',
        '3. Everything (CSS inside <style>, JavaScript inside <script>, inline SVG icons/graphics) MUST be 100% self-contained inside that single HTML file—never rely on external CDNs or remote image URLs so Preview and Download HTML work reliably everywhere.',
        '4. Set an accurate, clean <title>...</title> tag inside <head>.',
        '5. Never truncate code with "// ... rest of code" or TODO placeholders. Always include <meta name="viewport" content="width=device-width, initial-scale=1.0">.',
      ].join('\n');

      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      if (Array.isArray(history)) {
        for (const item of history.slice(-8)) {
          if (item && typeof item.text === 'string' && item.text.trim()) {
            contents.push({
              role: item.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: item.text.slice(0, 12000) }],
            });
          }
        }
      }

      const userPromptText =
        typeof currentHtml === 'string' && currentHtml.trim().length > 0
          ? `Current HTML Artifact (update and return the complete updated <!DOCTYPE html> document):\n\`\`\`html\n${currentHtml.slice(
              0,
              65000
            )}\n\`\`\`\n\nUser modification request:\n${prompt.trim()}`
          : prompt.trim();

      contents.push({ role: 'user', parts: [{ text: userPromptText }] });

      const ai = createAiClient(1);
      const modelsToTry =
        activeModel === 'gemini-4-hydrogen'
          ? [
              'gemini-4-hydrogen',
              'gemini-3.1-flash-lite',
              'gemini-3.7-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
            ]
          : activeModel === 'gemini-3.1-flash-lite'
          ? [
              'gemini-3.1-flash-lite',
              'gemini-3.7-flash',
              'gemini-3.5-flash',
              'gemini-3.5-flash-lite',
              'gemini-4-hydrogen',
            ]
          : [activeModel];

      const config: Record<string, unknown> = {
        systemInstruction: agentSystemInstruction,
      };
      if (activeModel === 'gemini-4-carbon') {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      let lastErr: unknown = null;
      let streamCompleted = false;

      for (let i = 0; i < modelsToTry.length; i++) {
        const candidateModel = modelsToTry[i];
        if (clientClosed) break;
        const hasFallbackRemaining = i < modelsToTry.length - 1;
        const connectController = new AbortController();
        const timeoutMs = hasFallbackRemaining ? 4500 : 35000;
        const timer = setTimeout(() => connectController.abort(), timeoutMs);
        let emittedAnyText = false;
        let sentMeta = false;

        try {
          const stream = await ai.models.generateContentStream({
            model: candidateModel,
            contents,
            config: {
              ...config,
              abortSignal: connectController.signal,
            },
          });
          clearTimeout(timer);

          for await (const chunk of stream) {
            if (clientClosed) break;
            if (!sentMeta) {
              sentMeta = true;
              sendEvent({ type: 'meta', modelUsed: candidateModel });
            }
            if (chunk.text) {
              emittedAnyText = true;
              sendEvent({ type: 'chunk', text: chunk.text });
            }
          }

          if (!sentMeta && !clientClosed) {
            sendEvent({ type: 'meta', modelUsed: candidateModel });
          }

          streamCompleted = true;
          break;
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          if (!emittedAnyText && hasFallbackRemaining && isTransientError(err)) {
            continue;
          }
          if (emittedAnyText && isTransientError(err)) {
            streamCompleted = true;
            break;
          }
          throw err;
        }
      }

      if (!streamCompleted && !clientClosed) {
        throw lastErr ?? new Error('Unable to connect to Agent stream.');
      }

      sendEvent({ type: 'done' });
      if (!res.writableEnded) res.end();
    } catch (err) {
      const formatted = formatGeminiError(err, 'chat');
      sendEvent({ type: 'error', error: formatted.message });
      if (!res.writableEnded) res.end();
    }
  });

  // 2. Image Generation & Picture Editing via Agnes AI (agnes-image-2.5-flash / 2.1-flash / 2.0-flash)
  app.post('/api/images/generate', async (req: Request, res: Response) => {
    try {
      const agnesApiKey = process.env.AGNES_API_KEY?.trim();
      if (!agnesApiKey) {
        res.status(500).json({
          error:
            'Agnes AI API key is not configured. Please add AGNES_API_KEY in Settings > Secrets.',
        });
        return;
      }

      const { prompt, model, aspectRatio, imageSize, images } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length === 0 || prompt.length > 2000) {
        res.status(400).json({ error: 'Please provide a valid prompt (1–2000 characters).' });
        return;
      }

      const selectedModel =
        typeof model === 'string' && IMAGE_MODELS.has(model)
          ? model
          : 'agnes-image-2.5-flash';

      const ratio =
        typeof aspectRatio === 'string' && STANDARD_ASPECT_RATIOS.has(aspectRatio)
          ? aspectRatio
          : '1:1';

      const size =
        typeof imageSize === 'string' && IMAGE_SIZES.has(imageSize) ? imageSize : '1K';

      const agnesSize = resolveAgnesDimensions(ratio, size);

      const referenceDataUris: string[] = [];
      if (Array.isArray(images)) {
        for (const img of images.slice(0, 4)) {
          if (
            img &&
            typeof img.mimeType === 'string' &&
            img.mimeType.startsWith('image/') &&
            img.mimeType.length <= 64 &&
            typeof img.data === 'string' &&
            img.data.length > 0 &&
            img.data.length <= 20_000_000
          ) {
            referenceDataUris.push(`data:${img.mimeType};base64,${img.data}`);
          }
        }
      }

      const extraBody: Record<string, unknown> = {
        response_format: 'b64_json',
      };
      if (referenceDataUris.length > 0) {
        extraBody.image = referenceDataUris;
      }

      const agnesRes = await fetch('https://apihub.agnes-ai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agnesApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: prompt.trim(),
          size: agnesSize,
          extra_body: extraBody,
        }),
        signal: AbortSignal.timeout(60000),
      });

      const rawText = await agnesRes.text();
      let agnesJson: {
        data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }>;
        error?: { message?: string } | string;
        message?: string;
      } = {};
      try {
        agnesJson = JSON.parse(rawText);
      } catch {
        // Non-JSON response
      }

      if (!agnesRes.ok) {
        const upstreamMsg = extractReadableMessage(
          typeof agnesJson?.error === 'string'
            ? agnesJson.error
            : agnesJson?.error?.message || agnesJson?.message || rawText
        );
        if (agnesRes.status === 401 || agnesRes.status === 403) {
          res.status(403).json({
            error: 'Agnes AI API key rejected or unauthorized. Please verify AGNES_API_KEY in Settings > Secrets.',
          });
          return;
        }
        if (agnesRes.status === 429) {
          res.status(429).json({
            error: 'Agnes AI rate limit or quota reached. Please try again shortly or check your Agnes AI plan.',
          });
          return;
        }
        res.status(agnesRes.status >= 400 && agnesRes.status < 600 ? agnesRes.status : 502).json({
          error: upstreamMsg || 'Agnes AI image request failed.',
        });
        return;
      }

      const firstItem = agnesJson.data?.[0];
      let imageDataUrl = '';

      if (firstItem?.b64_json) {
        imageDataUrl = `data:image/png;base64,${firstItem.b64_json}`;
      } else if (firstItem?.url) {
        const parsedUrl = new URL(firstItem.url);
        const hostAllowed =
          parsedUrl.protocol === 'https:' &&
          (parsedUrl.hostname === 'storage.googleapis.com' ||
            parsedUrl.hostname.endsWith('.agnes-ai.com') ||
            parsedUrl.hostname === 'agnes-ai.com');
        if (!hostAllowed) {
          res.status(502).json({ error: 'Received an untrusted image URL from upstream.' });
          return;
        }
        const imgFetch = await fetch(parsedUrl.toString(), {
          signal: AbortSignal.timeout(20000),
        });
        if (!imgFetch.ok) {
          res.status(502).json({ error: 'Failed to retrieve generated image asset.' });
          return;
        }
        const contentType = imgFetch.headers.get('content-type') || 'image/png';
        const arrayBuf = await imgFetch.arrayBuffer();
        const base64 = Buffer.from(arrayBuf).toString('base64');
        imageDataUrl = `data:${contentType.split(';')[0]};base64,${base64}`;
      }

      if (!imageDataUrl) {
        res.status(502).json({
          error: 'Agnes AI completed without returning an image. Try adjusting your prompt.',
        });
        return;
      }

      res.json({
        imageDataUrl,
        text: '',
        model: selectedModel,
        aspectRatio: ratio,
        imageSize: size,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Agnes AI image generation failed.';
      res.status(500).json({ error: msg });
    }
  });

  // 3. Audio Transcription (gemini-3.5-transcribe)
  app.post('/api/audio/transcribe', async (req: Request, res: Response) => {
    try {
      const { audioData, mimeType } = req.body ?? {};
      if (
        typeof audioData !== 'string' ||
        audioData.length === 0 ||
        audioData.length > 25_000_000 ||
        typeof mimeType !== 'string' ||
        !mimeType.startsWith('audio/')
      ) {
        res.status(400).json({ error: 'Valid audio data and audio MIME type are required.' });
        return;
      }

      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: audioData,
              },
            },
            {
              text: 'Transcribe this audio accurately and return only the transcribed text.',
            },
          ],
        },
      });

      res.json({ text: (response.text ?? '').trim() });
    } catch (err) {
      const formatted = formatGeminiError(err, 'audio');
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // 4. Text-to-Speech (gemini-3.8-flash-tts)
  app.post('/api/audio/tts', async (req: Request, res: Response) => {
    try {
      const { text, voiceName, style } = req.body ?? {};
      if (typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Text is required for speech synthesis.' });
        return;
      }

      const selectedVoice =
        typeof voiceName === 'string' && TTS_VOICES.has(voiceName) ? voiceName : 'Kore';

      const cleanText = text.replace(/[#*`>_~]/g, '').trim().slice(0, 3500);
      const userPart: {
        text: string;
        speechMetadata?: { style: string };
      } = { text: cleanText };

      if (typeof style === 'string' && style.trim().length > 0) {
        userPart.speechMetadata = { style: style.trim().slice(0, 160) };
      }

      const ai = createAiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-tts',
        contents: [
          {
            role: 'user',
            parts: [userPart],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

      if (!base64Audio) {
        res.status(502).json({ error: 'No audio returned by TTS model.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: selectedVoice,
      });
    } catch (err) {
      const formatted = formatGeminiError(err);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  // Mount Vite middleware in dev, or static files in prod
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build artifacts not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`After AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start After AI server:', err);
  process.exit(1);
});
