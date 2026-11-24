import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  ArrowUp,
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Globe,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Smartphone,
  Square,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { AgentArtifactRecord, AgentCategory, AgentTurn, ChatModelId } from '../types';
import { streamAgentResponse } from '../lib/api';
import {
  downloadHtmlFile,
  extractAgentArtifact,
  formatHtmlSize,
} from '../lib/artifactParser';

interface AgentViewProps {
  activeModel: ChatModelId;
  savedArtifacts: AgentArtifactRecord[];
  onSaveArtifact: (item: {
    id: string;
    title: string;
    category: AgentCategory;
    prompt: string;
    summary: string;
    html: string;
    model: string;
    isUpdate?: boolean;
  }) => Promise<void>;
  onDeleteArtifact: (artifactId: string) => Promise<void>;
}

const CATEGORY_OPTIONS: Array<{
  id: AgentCategory;
  label: string;
  icon: React.FC<{ className?: string }>;
}> = [
  { id: 'auto', label: 'Auto', icon: Layers },
  { id: 'app', label: 'Web App', icon: Code2 },
  { id: 'website', label: 'Website', icon: Globe },
];

const AGENT_STARTERS: Array<{
  title: string;
  meta: string;
  category: AgentCategory;
  prompt: string;
}> = [
  {
    title: 'Sprint & Task Board',
    meta: 'Web App · Kanban + Focus Timer + Persistence',
    category: 'app',
    prompt:
      'Build an interactive software sprint planner and focus timer web app with Backlog, In Progress, and Done Kanban columns, priority tags, quick add/move/delete tasks, a built-in Pomodoro timer with Web Audio chime, SVG sprint progress chart, search filter, and localStorage persistence.',
  },
  {
    title: 'Revenue & KPI Console',
    meta: 'Web App · SVG Charts + Filters + CSV Export',
    category: 'app',
    prompt:
      'Build a responsive SaaS revenue and KPI analytics console with timeframe filters (7D, 30D, 12M), clean tabular KPI summary cards, interactive SVG area/bar charts with hover tooltips, searchable transaction table, and working CSV export.',
  },
  {
    title: 'Architecture Studio Site',
    meta: 'Website · Editorial Showcase + Inquiry Drawer',
    category: 'website',
    prompt:
      'Build a modern minimalist architecture & spatial design studio website with crisp editorial typography, responsive mobile drawer, interactive project category filters, project detail modal with custom SVG architectural blueprints, and validated contact inquiry drawer.',
  },
  {
    title: 'SaaS Product Launch',
    meta: 'Website · Interactive Pricing + Feature Matrix',
    category: 'website',
    prompt:
      'Build a high-craft SaaS product launch landing website with a clean hero section, interactive monthly/annual pricing toggle, comparison feature matrix, customer testimonials, FAQ accordion, and waitlist/demo modal.',
  },
];

const QUICK_REFINE_ACTIONS: Array<{ label: string; prompt: string }> = [
  {
    label: 'Add dark mode',
    prompt:
      'Add a clean light/dark theme toggle button in the top header using CSS variables and remember the choice in localStorage while preserving every existing feature.',
  },
  {
    label: 'Improve mobile layout',
    prompt:
      'Refine the responsive layout for 360px–430px mobile viewports so there is zero horizontal overflow, crisp touch targets (>= 40px), and clean spacing.',
  },
  {
    label: 'Add animations',
    prompt:
      'Add subtle, smooth CSS transitions and entrance micro-animations using transform and opacity (respecting prefers-reduced-motion) without slowing down interactions.',
  },
  {
    label: 'Fix & polish UI',
    prompt:
      'Audit all buttons, forms, contrast, typography hierarchy, and interactive edge cases, fixing any bugs and polishing the overall visual craft.',
  },
];

const ClaudeCompletionBadge: React.FC<{
  title: string;
  model: string;
  htmlCode: string;
  onPreview: () => void;
  onFullscreen: () => void;
  onCopy: () => void;
  onDownload: () => void;
  copied: boolean;
}> = ({
  title,
  model,
  htmlCode,
  onPreview,
  onFullscreen,
  onCopy,
  onDownload,
  copied,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const lineCount = useMemo(() => htmlCode.split(/\r?\n/).length, [htmlCode]);
  const sizeLabel = useMemo(() => formatHtmlSize(htmlCode), [htmlCode]);

  return (
    <motion.div
      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.09] p-4"
    >
      {/* Subtle completion shimmer */}
      {!prefersReducedMotion && (
        <motion.div
          initial={{ x: '-100%', opacity: 0.5 }}
          animate={{ x: '200%', opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent"
        />
      )}

      <div className="flex items-start gap-3">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          {!prefersReducedMotion && (
            <motion.span
              initial={{ scale: 0.7, opacity: 0.6 }}
              animate={{ scale: 1.65, opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              className="absolute inset-0 rounded-full border border-emerald-500/60"
            />
          )}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
              <motion.path
                d="M5 13l4 4L19 7"
                initial={prefersReducedMotion ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              />
            </svg>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-emerald-700 dark:text-emerald-300 font-medium">
              <span>Task completed</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code tabular-nums">
                {lineCount} lines · {sizeLabel}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code truncate">{model}</span>
            </div>
            <p className="text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC] truncate mt-0.5">
              {title}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onPreview}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>

            <button
              type="button"
              onClick={onFullscreen}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-black/15 dark:border-white/15 bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fullscreen</span>
            </button>

            <button
              type="button"
              onClick={onCopy}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-black/15 dark:border-white/15 bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy HTML'}</span>
            </button>

            <button
              type="button"
              onClick={onDownload}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-black/15 dark:border-white/15 bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download HTML</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export const AgentView: React.FC<AgentViewProps> = ({
  activeModel,
  savedArtifacts,
  onSaveArtifact,
  onDeleteArtifact,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [category, setCategory] = useState<AgentCategory>('auto');
  const [promptInput, setPromptInput] = useState('');
  const [turns, setTurns] = useState<AgentTurn[]>([]);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [activeHtml, setActiveHtml] = useState('');
  const [activeTitle, setActiveTitle] = useState('After AI Build');
  const [activeBuildModel, setActiveBuildModel] = useState<string>(activeModel);

  const [isStreaming, setIsStreaming] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<'preview' | 'code'>('preview');
  const [mobilePane, setMobilePane] = useState<'chat' | 'preview' | 'code'>('chat');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
  const [savedSearch, setSavedSearch] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);
  const codeEndRef = useRef<HTMLPreElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, isStreaming]);

  useEffect(() => {
    if (isStreaming && workbenchTab === 'code' && codeEndRef.current) {
      codeEndRef.current.scrollTop = codeEndRef.current.scrollHeight;
    }
  }, [activeHtml, isStreaming, workbenchTab]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  }, [promptInput]);

  const codeLineCount = useMemo(
    () => (activeHtml ? activeHtml.split(/\r?\n/).length : 0),
    [activeHtml]
  );

  const filteredSavedArtifacts = useMemo(() => {
    const q = savedSearch.trim().toLowerCase();
    if (!q) return savedArtifacts;
    return savedArtifacts.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q)
    );
  }, [savedArtifacts, savedSearch]);

  const handleCopyCode = async () => {
    if (!activeHtml) return;
    try {
      await navigator.clipboard.writeText(activeHtml);
      setCopied(true);
      setTimeout(() => setCopied((c) => (c ? false : c)), 1800);
    } catch {
      setError('Clipboard permission unavailable.');
    }
  };

  const handleDownload = () => {
    if (!activeHtml) return;
    downloadHtmlFile(activeHtml, activeTitle);
  };

  const handleNewBuild = () => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setTurns([]);
    setActiveArtifactId(null);
    setActiveHtml('');
    setActiveTitle('After AI Build');
    setError(null);
    setMobilePane('chat');
  };

  const handleLoadSaved = (item: AgentArtifactRecord) => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setError(null);
    setActiveArtifactId(item.id);
    setActiveHtml(item.html);
    setActiveTitle(item.title);
    setActiveBuildModel(item.model);
    setCategory(item.category === 'app' || item.category === 'website' ? item.category : 'auto');
    setTurns([
      {
        id: `loaded_u_${item.id}`,
        role: 'user',
        prompt: item.prompt,
        summary: item.prompt,
        category: item.category,
        model: item.model,
        status: 'completed',
        createdAtMs: item.createdAtMs,
      },
      {
        id: `loaded_a_${item.id}`,
        role: 'assistant',
        prompt: item.prompt,
        summary: item.summary || 'Loaded saved After AI Agent build.',
        htmlCode: item.html,
        artifactTitle: item.title,
        category: item.category,
        model: item.model,
        status: 'completed',
        createdAtMs: item.updatedAtMs,
      },
    ]);
    setWorkbenchTab('preview');
    setMobilePane('preview');
    setPreviewKey((k) => k + 1);
    setSavedDrawerOpen(false);
  };

  const runAgentBuild = async (overridePrompt?: string, overrideCategory?: AgentCategory) => {
    const cleanPrompt = (overridePrompt ?? promptInput).trim();
    if (!cleanPrompt || isStreaming) return;

    const chosenCategory = overrideCategory ?? category;
    if (overrideCategory) setCategory(overrideCategory);
    if (!overridePrompt) setPromptInput('');
    setError(null);

    const userTurnId = `ag_u_${Date.now()}`;
    const assistantTurnId = `ag_a_${Date.now() + 1}`;
    const fallbackTitle = cleanPrompt.slice(0, 60);

    const userTurn: AgentTurn = {
      id: userTurnId,
      role: 'user',
      prompt: cleanPrompt,
      summary: cleanPrompt,
      category: chosenCategory,
      model: activeModel,
      status: 'completed',
      createdAtMs: Date.now(),
    };

    const assistantTurn: AgentTurn = {
      id: assistantTurnId,
      role: 'assistant',
      prompt: cleanPrompt,
      summary: '',
      category: chosenCategory,
      model: activeModel,
      status: 'streaming',
      createdAtMs: Date.now() + 1,
    };

    const historyPayload = turns
      .filter((t) => t.status === 'completed')
      .slice(-6)
      .map((t) => ({
        role: t.role,
        text: t.role === 'user' ? t.prompt : t.summary || 'Built interactive HTML artifact.',
      }));

    const existingHtmlForEdit = activeHtml.trim().length > 0 ? activeHtml : undefined;

    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setIsStreaming(true);

    // Switch desktop/tablet workbench to Code during live generation so user sees streaming progress,
    // and switch to Preview automatically when build completes.
    if (activeHtml === '') {
      setWorkbenchTab('code');
    }

    const controller = new AbortController();
    abortRef.current = controller;

    let rawStreamText = '';
    let usedModel: string = activeModel;
    let switchedToCode = false;

    try {
      await streamAgentResponse({
        model: activeModel,
        category: chosenCategory,
        prompt: cleanPrompt,
        currentHtml: existingHtmlForEdit,
        history: historyPayload,
        signal: controller.signal,
        onMeta: (meta) => {
          usedModel = meta.modelUsed;
          setActiveBuildModel(usedModel);
          setTurns((prev) =>
            prev.map((t) => (t.id === assistantTurnId ? { ...t, model: usedModel } : t))
          );
        },
        onChunk: (chunkText) => {
          rawStreamText += chunkText;
          const parsed = extractAgentArtifact(rawStreamText, fallbackTitle);

          if (parsed.isCodeStarted && !switchedToCode) {
            switchedToCode = true;
            setWorkbenchTab('code');
          }

          if (parsed.htmlCode) {
            setActiveHtml(parsed.htmlCode);
            setActiveTitle(parsed.title);
          }

          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurnId
                ? {
                    ...t,
                    summary: parsed.summary,
                    htmlCode: parsed.htmlCode || undefined,
                    artifactTitle: parsed.title,
                  }
                : t
            )
          );
        },
      });

      const finalParsed = extractAgentArtifact(rawStreamText, fallbackTitle);
      const finalHtml = finalParsed.htmlCode || activeHtml;
      const finalTitle = finalParsed.title || activeTitle;
      const finalSummary =
        finalParsed.summary || 'Built interactive standalone HTML application.';

      if (finalHtml) {
        setActiveHtml(finalHtml);
        setActiveTitle(finalTitle);
        setWorkbenchTab('preview');
        setPreviewKey((k) => k + 1);
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
          setMobilePane('preview');
        }
      }

      setTurns((prev) =>
        prev.map((t) =>
          t.id === assistantTurnId
            ? {
                ...t,
                summary: finalSummary,
                htmlCode: finalHtml || undefined,
                artifactTitle: finalTitle,
                model: usedModel,
                status: 'completed',
              }
            : t
        )
      );

      if (finalHtml) {
        const artifactId = activeArtifactId || `art_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const isUpdate = Boolean(activeArtifactId);
        setActiveArtifactId(artifactId);
        onSaveArtifact({
          id: artifactId,
          title: finalTitle,
          category: chosenCategory,
          prompt: cleanPrompt,
          summary: finalSummary,
          html: finalHtml,
          model: usedModel,
          isUpdate,
        }).catch((err) => console.error('Failed to save agent artifact:', err));
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Agent generation failed.';
        setError(msg);
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurnId ? { ...t, status: 'error', summary: msg } : t
          )
        );
      } else {
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurnId
              ? { ...t, status: 'completed', summary: t.summary || 'Stopped.' }
              : t
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  const hasSession = turns.length > 0 || activeHtml.length > 0;

  const composerBox = (
    <div className="w-full space-y-2">
      {error && (
        <div className="px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {activeHtml && !isStreaming && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {QUICK_REFINE_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => runAgentBuild(action.prompt)}
              className="min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-medium border border-[#E2E2E2] dark:border-[#363636] bg-white dark:bg-[#242424] text-[#4A4A4A] dark:text-[#D4D4D4] hover:border-[#0D0D0D] dark:hover:border-white/40 hover:text-[#0D0D0D] dark:hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-[22px] border border-[#E5E5E5] dark:border-[#383838] bg-[#F4F4F4] dark:bg-[#2A2A2A] focus-within:border-[#CCCCCC] dark:focus-within:border-[#555555] transition-colors">
        <textarea
          ref={textareaRef}
          rows={1}
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              runAgentBuild();
            }
          }}
          placeholder={
            activeHtml
              ? 'Ask the Agent to upgrade, restyle, or add features to this build...'
              : 'Describe a web app or responsive website to build...'
          }
          className="w-full resize-none bg-transparent px-4 pt-3 pb-1.5 text-[14px] sm:text-[15px] leading-relaxed text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#737373] dark:placeholder-[#9A9A9A] focus:outline-none max-h-[160px]"
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-1">
          <div className="inline-flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05] overflow-x-auto no-scrollbar">
            {CATEGORY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = category === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCategory(opt.id)}
                  className={`min-h-[30px] inline-flex items-center gap-1.5 px-2.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    selected
                      ? 'bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D]'
                      : 'text-[#555555] dark:text-[#B4B4B4] hover:bg-black/5 dark:hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          {isStreaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop Agent build"
              className="min-w-[36px] min-h-[36px] rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] flex items-center justify-center hover:opacity-90 cursor-pointer shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!promptInput.trim()}
              onClick={() => runAgentBuild()}
              aria-label="Build with Agent"
              className="min-w-[36px] min-h-[36px] rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] flex items-center justify-center hover:opacity-90 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Sub-toolbar for Saved Builds + Mobile Pane Switcher */}
      <div className="shrink-0 flex items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-[#EBEBEB] dark:border-[#2C2C2C] bg-[#FAFAFA] dark:bg-[#1B1B1B]">
        <div className="flex items-center gap-2 min-w-0">
          {hasSession && (
            <div className="flex lg:hidden items-center gap-1 p-0.5 rounded-xl bg-[#ECECEC] dark:bg-[#2A2A2A]">
              <button
                type="button"
                onClick={() => setMobilePane('chat')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                  mobilePane === 'chat'
                    ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                    : 'text-[#666666] dark:text-[#A4A4A4]'
                }`}
              >
                Agent
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('preview')}
                disabled={!activeHtml}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                  mobilePane === 'preview'
                    ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                    : 'text-[#666666] dark:text-[#A4A4A4]'
                }`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('code')}
                disabled={!activeHtml}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                  mobilePane === 'code'
                    ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                    : 'text-[#666666] dark:text-[#A4A4A4]'
                }`}
              >
                Code
              </button>
            </div>
          )}
          <span className="hidden lg:inline text-xs text-[#666666] dark:text-[#9A9A9A] truncate">
            {hasSession ? `${activeTitle} · ${activeBuildModel}` : 'Claude-style Coding Agent · Web Apps & Responsive Websites'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {savedArtifacts.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setSavedDrawerOpen((o) => !o)}
                className="min-h-[34px] inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-[#E0E0E0] dark:border-[#363636] bg-white dark:bg-[#242424] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-[#F4F4F4] dark:hover:bg-[#2E2E2E] cursor-pointer whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="tabular-nums">Saved ({savedArtifacts.length})</span>
              </button>

              {savedDrawerOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setSavedDrawerOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1.5 z-30 w-76 max-h-88 flex flex-col rounded-2xl border border-[#E5E5E5] dark:border-[#363636] bg-white dark:bg-[#242424] shadow-xl p-1.5">
                    {savedArtifacts.length > 3 && (
                      <div className="p-1 pb-1.5 border-b border-[#EFEFEF] dark:border-[#323232]">
                        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#F5F5F5] dark:bg-[#1B1B1B]">
                          <Search className="w-3.5 h-3.5 text-[#737373] shrink-0" />
                          <input
                            type="text"
                            value={savedSearch}
                            onChange={(e) => setSavedSearch(e.target.value)}
                            placeholder="Search saved builds..."
                            className="w-full bg-transparent text-xs text-[#0D0D0D] dark:text-white placeholder-[#737373] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                    <div className="overflow-y-auto space-y-1 pt-1">
                      {filteredSavedArtifacts.length === 0 ? (
                        <p className="text-xs text-[#737373] text-center py-4">
                          No matching builds found.
                        </p>
                      ) : (
                        filteredSavedArtifacts.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl hover:bg-[#F4F4F4] dark:hover:bg-[#303030]"
                          >
                            <button
                              type="button"
                              onClick={() => handleLoadSaved(item)}
                              className="flex-1 min-w-0 text-left cursor-pointer"
                            >
                              <p className="text-xs font-medium text-[#0D0D0D] dark:text-white truncate">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-[#737373] dark:text-[#9A9A9A] truncate">
                                {item.category} · {item.model}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteArtifact(item.id)}
                              aria-label={`Delete ${item.title}`}
                              className="p-1.5 rounded-lg text-[#737373] hover:text-red-500 cursor-pointer shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {hasSession && (
            <button
              type="button"
              onClick={handleNewBuild}
              className="min-h-[34px] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-[#E0E0E0] dark:border-[#363636] bg-white dark:bg-[#242424] text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-[#F4F4F4] dark:hover:bg-[#2E2E2E] cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New build</span>
            </button>
          )}
        </div>
      </div>

      {!hasSession ? (
        /* Empty Agent Landing State */
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-4 sm:px-6 py-8 safe-pb">
          <div className="w-full max-w-3xl mx-auto space-y-6">
            <div className="text-center space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#0D0D0D] dark:text-[#ECECEC] text-balance">
                What should After AI Agent build?
              </h1>
              <p className="text-xs sm:text-sm text-[#737373] dark:text-[#9A9A9A]">
                Create interactive web apps and responsive websites with live preview, copy, and HTML download.
              </p>
            </div>

            {composerBox}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {AGENT_STARTERS.map((starter) => (
                <button
                  key={starter.title}
                  type="button"
                  onClick={() => runAgentBuild(starter.prompt, starter.category)}
                  className="text-left p-4 rounded-2xl border border-[#E5E5E5] dark:border-[#343434] bg-[#FAFAFA] dark:bg-[#262626] hover:border-[#0D0D0D] dark:hover:border-white/40 transition-colors cursor-pointer space-y-1"
                >
                  <p className="text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC]">
                    {starter.title}
                  </p>
                  <p className="text-xs text-[#737373] dark:text-[#9A9A9A]">
                    {starter.meta}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Active Split Coding Workbench */
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(350px,430px)_1fr]">
          {/* Left Pane: Agent Conversation & Completion Animations */}
          <div
            className={`min-h-0 flex-col border-r border-[#EBEBEB] dark:border-[#2C2C2C] ${
              mobilePane === 'chat' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            <div className="flex-1 overflow-y-auto px-3.5 sm:px-5 py-4 space-y-5">
              {turns.map((turn) =>
                turn.role === 'user' ? (
                  <div key={turn.id} className="flex justify-end">
                    <div className="max-w-[88%] rounded-2xl px-4 py-2.5 bg-[#F4F4F4] dark:bg-[#2F2F2F] text-sm leading-relaxed text-[#0D0D0D] dark:text-[#ECECEC] whitespace-pre-wrap break-words">
                      {turn.prompt}
                    </div>
                  </div>
                ) : (
                  <div key={turn.id} className="space-y-3">
                    <div className="text-xs text-[#737373] dark:text-[#8E8E8E] flex items-center gap-1.5">
                      <span className="font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                        After AI Agent
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-code">{turn.model}</span>
                    </div>

                    {turn.status === 'streaming' && (() => {
                      const hasScript = Boolean(turn.htmlCode && /<script[\s>]/i.test(turn.htmlCode));
                      const stageLabel = hasScript
                        ? 'Wiring interactive logic'
                        : turn.htmlCode
                        ? 'Writing HTML & CSS'
                        : 'Planning layout & state';
                      const linesGenerated = turn.htmlCode
                        ? turn.htmlCode.split(/\r?\n/).length
                        : 0;

                      return (
                        <div className="relative overflow-hidden rounded-2xl border border-[#E5E5E5] dark:border-[#343434] bg-[#FAFAFA] dark:bg-[#262626] p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                            <span className="inline-flex items-center gap-2 min-w-0">
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                              <span className="truncate">{stageLabel}...</span>
                            </span>
                            {linesGenerated > 0 && (
                              <span className="font-mono-code text-[11px] tabular-nums text-[#737373] dark:text-[#9A9A9A] shrink-0">
                                {linesGenerated} lines
                              </span>
                            )}
                          </div>
                          <div className="h-1 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08] overflow-hidden relative">
                            {!prefersReducedMotion ? (
                              <motion.div
                                initial={{ x: '-60%' }}
                                animate={{ x: '220%' }}
                                transition={{
                                  duration: 1.35,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }}
                                className="h-full w-2/5 rounded-full bg-[#0D0D0D]/60 dark:bg-white/60"
                              />
                            ) : (
                              <div className="h-full w-1/2 rounded-full bg-[#0D0D0D]/40 dark:bg-white/40" />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {turn.summary && (
                      <div
                        className={`after-prose text-sm ${
                          turn.status === 'error'
                            ? 'text-red-700 dark:text-red-300'
                            : 'text-[#0D0D0D] dark:text-[#ECECEC]'
                        }`}
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {turn.summary}
                        </ReactMarkdown>
                      </div>
                    )}

                    {turn.status === 'error' && !isStreaming && (
                      <button
                        type="button"
                        onClick={() => runAgentBuild(turn.prompt, turn.category)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-500/15 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry build</span>
                      </button>
                    )}

                    <AnimatePresence>
                      {turn.status === 'completed' && turn.htmlCode && (
                        <ClaudeCompletionBadge
                          title={turn.artifactTitle || activeTitle}
                          model={turn.model}
                          htmlCode={turn.htmlCode}
                          copied={copied}
                          onPreview={() => {
                            setActiveHtml(turn.htmlCode!);
                            setActiveTitle(turn.artifactTitle || 'After AI Build');
                            setWorkbenchTab('preview');
                            setMobilePane('preview');
                            setPreviewKey((k) => k + 1);
                          }}
                          onFullscreen={() => {
                            setActiveHtml(turn.htmlCode!);
                            setActiveTitle(turn.artifactTitle || 'After AI Build');
                            setPreviewKey((k) => k + 1);
                            setFullscreenOpen(true);
                          }}
                          onCopy={async () => {
                            setActiveHtml(turn.htmlCode!);
                            try {
                              await navigator.clipboard.writeText(turn.htmlCode!);
                              setCopied(true);
                              setTimeout(() => setCopied((c) => (c ? false : c)), 1800);
                            } catch {
                              setError('Clipboard unavailable.');
                            }
                          }}
                          onDownload={() =>
                            downloadHtmlFile(
                              turn.htmlCode!,
                              turn.artifactTitle || 'After AI Build'
                            )
                          }
                        />
                      )}
                    </AnimatePresence>
                  </div>
                )
              )}
              <div ref={turnsEndRef} />
            </div>

            <div className="p-3 sm:p-4 border-t border-[#EBEBEB] dark:border-[#2C2C2C] bg-white dark:bg-[#212121] safe-pb">
              {composerBox}
            </div>
          </div>

          {/* Right Pane: Live Sandboxed Preview & Streaming Code Workbench */}
          <div
            className={`min-h-0 flex-col bg-[#F7F7F7] dark:bg-[#181818] ${
              mobilePane !== 'chat' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* Workbench Toolbar */}
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-[#E5E5E5] dark:border-[#2C2C2C] bg-white dark:bg-[#212121]">
              <div className="flex items-center gap-1 p-0.5 rounded-xl bg-[#F0F0F0] dark:bg-[#2C2C2C]">
                <button
                  type="button"
                  onClick={() => {
                    setWorkbenchTab('preview');
                    setMobilePane('preview');
                  }}
                  className={`min-h-[32px] inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                    workbenchTab === 'preview' && mobilePane !== 'code'
                      ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                      : 'text-[#666666] dark:text-[#A4A4A4]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkbenchTab('code');
                    setMobilePane('code');
                  }}
                  className={`min-h-[32px] inline-flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                    workbenchTab === 'code' || mobilePane === 'code'
                      ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                      : 'text-[#666666] dark:text-[#A4A4A4]'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Code ({codeLineCount})</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {(workbenchTab === 'preview' && mobilePane !== 'code') && (
                  <>
                    <div className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg border border-[#E5E5E5] dark:border-[#363636]">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        aria-label="Desktop preview"
                        title="Desktop width"
                        className={`p-1.5 rounded-md cursor-pointer ${
                          previewDevice === 'desktop'
                            ? 'bg-[#ECECEC] dark:bg-[#363636] text-[#0D0D0D] dark:text-white'
                            : 'text-[#737373]'
                        }`}
                      >
                        <Monitor className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        aria-label="Mobile preview"
                        title="Mobile width"
                        className={`p-1.5 rounded-md cursor-pointer ${
                          previewDevice === 'mobile'
                            ? 'bg-[#ECECEC] dark:bg-[#363636] text-[#0D0D0D] dark:text-white'
                            : 'text-[#737373]'
                        }`}
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!activeHtml}
                      onClick={() => setPreviewKey((k) => k + 1)}
                      aria-label="Reload preview"
                      title="Reload / Restart"
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[#E5E5E5] dark:border-[#363636] text-[#4A4A4A] dark:text-[#CCCCCC] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] disabled:opacity-40 cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={!activeHtml}
                      onClick={() => setFullscreenOpen(true)}
                      aria-label="Fullscreen preview"
                      title="Fullscreen preview"
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[#E5E5E5] dark:border-[#363636] text-[#4A4A4A] dark:text-[#CCCCCC] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] disabled:opacity-40 cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}

                <button
                  type="button"
                  disabled={!activeHtml}
                  onClick={handleCopyCode}
                  className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-[#E5E5E5] dark:border-[#363636] text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  disabled={!activeHtml}
                  onClick={handleDownload}
                  className="min-h-[32px] inline-flex items-center gap-1.5 px-3 rounded-lg bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] text-xs font-medium hover:opacity-90 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download HTML</span>
                </button>
              </div>
            </div>

            {/* Workbench Canvas */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
              {!activeHtml ? (
                <div className="text-center space-y-2 max-w-sm px-4">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-[#737373]" />
                  <p className="text-sm font-medium text-[#0D0D0D] dark:text-[#ECECEC]">
                    Preparing your interactive build...
                  </p>
                  <p className="text-xs text-[#737373] dark:text-[#9A9A9A]">
                    HTML code and live preview will appear here automatically.
                  </p>
                </div>
              ) : workbenchTab === 'code' || mobilePane === 'code' ? (
                <pre
                  ref={codeEndRef}
                  className="w-full h-full rounded-xl bg-[#161616] text-[#EAEAEA] border border-[#2C2C2C] p-4 overflow-auto text-xs leading-relaxed font-mono-code whitespace-pre"
                >
                  <code>{activeHtml}</code>
                </pre>
              ) : (
                <motion.div
                  key={`frame_${previewKey}`}
                  initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.99 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25 }}
                  className={`h-full bg-white rounded-xl border border-[#E0E0E0] dark:border-[#333333] overflow-hidden shadow-sm transition-all ${
                    previewDevice === 'mobile' ? 'w-full max-w-[390px]' : 'w-full'
                  }`}
                >
                  <iframe
                    key={previewKey}
                    title={activeTitle}
                    srcDoc={activeHtml}
                    sandbox="allow-scripts"
                    className="w-full h-full border-0 bg-white"
                  />
                </motion.div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Live Preview Modal */}
      {fullscreenOpen && activeHtml && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0D0D0D]">
          <div className="h-12 shrink-0 flex items-center justify-between px-4 bg-[#181818] border-b border-white/10 text-white">
            <span className="text-sm font-medium truncate">{activeTitle}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewKey((k) => k + 1)}
                className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Restart</span>
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="min-h-[32px] inline-flex items-center gap-1.5 px-2.5 rounded-lg bg-white text-black text-xs font-medium cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download HTML</span>
              </button>
              <button
                type="button"
                onClick={() => setFullscreenOpen(false)}
                aria-label="Exit fullscreen preview"
                className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <iframe
            key={`fs_${previewKey}`}
            title={`${activeTitle} Fullscreen`}
            srcDoc={activeHtml}
            sandbox="allow-scripts"
            className="flex-1 w-full border-0 bg-white"
          />
        </div>
      )}
    </div>
  );
};
