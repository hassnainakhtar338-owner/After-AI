import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Code2,
  Image as ImageIcon,
  MessageSquare,
  PanelLeft,
  SquarePen,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AgentArtifactRecord,
  AgentCategory,
  ChatAttachment,
  ChatMessage,
  ChatModelId,
  ChatSession,
  ImageCreationRecord,
  ImageModelId,
  WorkspaceTab,
} from './types';
import {
  createChatSession,
  createClientId,
  deleteAgentArtifact,
  deleteChatSession,
  ensureUserProfile,
  observeAuth,
  saveAgentArtifact,
  saveChatMessage,
  saveImageCreation,
  signInWithGoogle,
  signOutUser,
  subscribeToArtifacts,
  subscribeToChats,
  subscribeToCreations,
  subscribeToMessages,
  updateChatSession,
  updateUserPreferences,
} from './lib/firebase';
import { generateOrEditImage, streamChatResponse } from './lib/api';
import { CHAT_MODELS, SYSTEM_PRESETS } from './lib/models';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AgentView } from './components/AgentView';
import { ImageStudioView } from './components/ImageStudioView';
import { ErrorBoundary } from './components/ErrorBoundary';

function AfterAiWorkspace() {
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('chat');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('after-ai-theme');
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });

  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Chat & Studio state
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [creations, setCreations] = useState<ImageCreationRecord[]>([]);
  const [artifacts, setArtifacts] = useState<AgentArtifactRecord[]>([]);
  const [activeModel, setActiveModel] = useState<ChatModelId>('gemini-4-hydrogen');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [systemInstruction, setSystemInstruction] = useState(
    SYSTEM_PRESETS[0].instruction
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const localAttachmentsCacheRef = useRef<Map<string, ChatAttachment[]>>(new Map());
  const localGeneratedImagesCacheRef = useRef<Map<string, string>>(new Map());

  // Sync Tailwind .dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem('after-ai-theme', theme);
  }, [theme]);

  // Observe Firebase Auth
  useEffect(() => {
    const unsub = observeAuth(async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);

      if (firebaseUser) {
        try {
          const profile = await ensureUserProfile(firebaseUser, theme);
          setActiveModel(
            profile.preferredModel === 'gemini-3.1-flash-lite'
              ? 'gemini-3.1-flash-lite'
              : 'gemini-4-hydrogen'
          );
          setTheme(profile.theme);
        } catch (err) {
          setErrorBanner(
            err instanceof Error ? err.message : 'Unable to load user profile.'
          );
        }
      } else {
        setChats([]);
        setCreations([]);
        setArtifacts([]);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore chats, creations & agent artifacts when signed in
  useEffect(() => {
    if (!user) return;
    const unsubChats = subscribeToChats(
      user.uid,
      (list) => setChats(list),
      (err) => setErrorBanner(err.message)
    );
    const unsubCreations = subscribeToCreations(
      user.uid,
      (list) => setCreations(list),
      (err) => setErrorBanner(err.message)
    );
    const unsubArtifacts = subscribeToArtifacts(
      user.uid,
      (list) => setArtifacts(list),
      (err) => setErrorBanner(err.message)
    );
    return () => {
      unsubChats();
      unsubCreations();
      unsubArtifacts();
    };
  }, [user]);

  // Subscribe to messages for active Firestore chat
  useEffect(() => {
    if (!user || !activeChatId) return;
    const unsubMsgs = subscribeToMessages(
      user.uid,
      activeChatId,
      (list) => {
        const hydrated = list.map((m) => ({
          ...m,
          localAttachments: localAttachmentsCacheRef.current.get(m.id),
          generatedImageUrl: localGeneratedImagesCacheRef.current.get(m.id),
        }));
        setMessages(hydrated);
      },
      (err) => setErrorBanner(err.message)
    );
    return () => unsubMsgs();
  }, [user, activeChatId]);

  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    if (user) {
      updateUserPreferences(user.uid, { theme: next }).catch(() => {});
    }
  };

  const handleChangeModel = (model: ChatModelId) => {
    setActiveModel(model);
    if (user) {
      updateUserPreferences(user.uid, { preferredModel: model }).catch(() => {});
      if (activeChatId) {
        updateChatSession(user.uid, activeChatId, { model }).catch(() => {});
      }
    }
  };

  const handleChangeSystemInstruction = (instruction: string) => {
    setSystemInstruction(instruction);
    if (user && activeChatId) {
      updateChatSession(user.uid, activeChatId, {
        systemInstruction: instruction,
      }).catch(() => {});
    }
  };

  const handleNewChat = () => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setActiveChatId(null);
    setMessages([]);
    setErrorBanner(null);
  };

  const handleSelectChat = (chatId: string) => {
    const target = chats.find((c) => c.id === chatId);
    if (target) {
      setActiveModel(
        target.model === 'gemini-3.1-flash-lite'
          ? 'gemini-3.1-flash-lite'
          : 'gemini-4-hydrogen'
      );
      if (target.systemInstruction) {
        setSystemInstruction(target.systemInstruction);
      }
    }
    setActiveChatId(chatId);
    setErrorBanner(null);
  };

  const handleDeleteChat = async (chatId: string) => {
    if (!user) return;
    try {
      await deleteChatSession(user.uid, chatId);
      if (activeChatId === chatId) {
        handleNewChat();
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete chat.');
    }
  };

  const handleSignIn = async () => {
    setErrorBanner(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
      );
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    handleNewChat();
  };

  const runAssistantTurn = async (params: {
    historyForApi: ChatMessage[];
    resolvedChatId: string;
    currentChatId: string | null;
    isFirstTurn: boolean;
    promptText: string;
    requestModel: ChatModelId;
    imageMode?: boolean;
    selectedImageModel: ImageModelId;
    imageAttachments: ChatAttachment[];
    baseMessages: ChatMessage[];
  }) => {
    const {
      historyForApi,
      resolvedChatId,
      currentChatId,
      isFirstTurn,
      promptText,
      requestModel,
      imageMode,
      selectedImageModel,
      imageAttachments,
      baseMessages,
    } = params;

    const assistantMsgId = createClientId('msg');
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      chatId: resolvedChatId,
      role: 'assistant',
      content: '',
      model: imageMode ? selectedImageModel : requestModel,
      thinkingUsed: !imageMode && requestModel === 'gemini-4-carbon',
      createdAtMs: Date.now() + 1,
    };

    setMessages([...baseMessages, placeholderAssistant]);

    // Inline Agnes AI image generate/edit turn inside Chat UI
    if (imageMode) {
      setIsStreaming(true);
      try {
        const imageInputs = imageAttachments
          .filter((a) => a.kind === 'image')
          .map((a) => ({ mimeType: a.mimeType, data: a.data }));

        const result = await generateOrEditImage({
          prompt: promptText,
          model: selectedImageModel,
          aspectRatio: '1:1',
          imageSize: '1K',
          images: imageInputs,
        });

        localGeneratedImagesCacheRef.current.set(assistantMsgId, result.imageDataUrl);
        const caption =
          result.text ||
          (imageInputs.length > 0
            ? 'Picture edited with Agnes AI.'
            : 'Image created with Agnes AI.');

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: caption,
                  model: result.model,
                  generatedImageUrl: result.imageDataUrl,
                }
              : m
          )
        );

        if (user && currentChatId) {
          await saveChatMessage(user.uid, currentChatId, {
            id: assistantMsgId,
            role: 'assistant',
            content: caption,
            model: result.model,
            thinkingUsed: false,
            attachmentLabel: 'Generated image',
          });
          await updateChatSession(user.uid, currentChatId, {
            incrementMessages: isFirstTurn ? 2 : 1,
            ...(isFirstTurn ? { title: promptText.slice(0, 72) } : {}),
          });
          await saveImageCreation(user.uid, {
            id: createClientId('img'),
            prompt: promptText,
            model: result.model,
            aspectRatio: result.aspectRatio,
            imageSize: result.imageSize,
            mode: imageInputs.length > 0 ? 'edit' : 'generate',
          });
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Image generation failed.';
        setErrorBanner(message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
      } finally {
        setIsStreaming(false);
      }
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);

    let fullAssistantText = '';
    let resolvedModel: string = requestModel;
    let thinkingUsed = requestModel === 'gemini-4-carbon';

    try {
      await streamChatResponse({
        model: requestModel,
        messages: historyForApi.map((m) => ({
          role: m.role,
          text: m.content,
          attachments: m.localAttachments,
        })),
        systemInstruction,
        signal: controller.signal,
        onMeta: (meta) => {
          resolvedModel = meta.modelUsed;
          thinkingUsed = meta.thinkingUsed;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, model: resolvedModel, thinkingUsed }
                : m
            )
          );
        },
        onChunk: (chunkText) => {
          fullAssistantText += chunkText;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: fullAssistantText } : m
            )
          );
        },
      });

      if (user && currentChatId && fullAssistantText.trim()) {
        await saveChatMessage(user.uid, currentChatId, {
          id: assistantMsgId,
          role: 'assistant',
          content: fullAssistantText,
          model: resolvedModel,
          thinkingUsed,
        });
        await updateChatSession(user.uid, currentChatId, {
          incrementMessages: isFirstTurn ? 2 : 1,
          ...(isFirstTurn ? { title: promptText.slice(0, 72) } : {}),
        });
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message =
          err instanceof Error ? err.message : 'Unable to generate response.';
        setErrorBanner(message);
        if (!fullAssistantText) {
          setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
        }
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  const handleSendMessage = async (payload: {
    text: string;
    attachments: ChatAttachment[];
    imageMode?: boolean;
    imageModel?: ImageModelId;
  }) => {
    setErrorBanner(null);
    let currentChatId = activeChatId;
    const isFirstTurn = !currentChatId;
    const requestModel: ChatModelId = activeModel;

    const userMsgId = createClientId('msg');

    if (payload.attachments.length > 0) {
      localAttachmentsCacheRef.current.set(userMsgId, payload.attachments);
    }

    const attachmentLabel =
      payload.attachments.length > 0
        ? payload.attachments.map((a) => `${a.kind}: ${a.name}`).join(', ')
        : undefined;

    if (user && !currentChatId) {
      currentChatId = createClientId('chat');
      const generatedTitle = payload.text.slice(0, 72) || 'New conversation';
      try {
        await createChatSession(
          user.uid,
          currentChatId,
          generatedTitle,
          requestModel,
          systemInstruction
        );
        setActiveChatId(currentChatId);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Failed to save chat.');
      }
    }

    const resolvedChatId = currentChatId || 'local_session';
    const selectedImageModel: ImageModelId =
      payload.imageModel || 'agnes-image-2.5-flash';

    const userMessage: ChatMessage = {
      id: userMsgId,
      chatId: resolvedChatId,
      role: 'user',
      content: payload.text,
      model: payload.imageMode ? selectedImageModel : requestModel,
      thinkingUsed: false,
      attachmentLabel,
      localAttachments: payload.attachments,
      createdAtMs: Date.now(),
    };

    const baseMessages = [...messages, userMessage];
    const historyForApi = [
      ...messages.filter(
        (m) =>
          m.content.trim().length > 0 ||
          (m.localAttachments && m.localAttachments.length > 0)
      ),
      userMessage,
    ];

    if (user && currentChatId) {
      saveChatMessage(user.uid, currentChatId, {
        id: userMsgId,
        role: 'user',
        content: payload.text,
        model: payload.imageMode ? selectedImageModel : requestModel,
        thinkingUsed: false,
        attachmentLabel,
      }).catch((err) => console.error(err));
    }

    await runAssistantTurn({
      historyForApi,
      resolvedChatId,
      currentChatId,
      isFirstTurn,
      promptText: payload.text,
      requestModel,
      imageMode: payload.imageMode,
      selectedImageModel,
      imageAttachments: payload.attachments,
      baseMessages,
    });
  };

  const handleRegenerateLastResponse = async () => {
    if (isStreaming || messages.length === 0) return;

    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    setErrorBanner(null);
    const targetUserMsg = messages[lastUserIdx];
    const baseMessages = messages.slice(0, lastUserIdx + 1);
    const historyForApi = baseMessages.filter(
      (m) =>
        m.content.trim().length > 0 ||
        (m.localAttachments && m.localAttachments.length > 0)
    );

    const isImageTurn = targetUserMsg.model.startsWith('agnes-image-');
    const selectedImageModel: ImageModelId = isImageTurn
      ? (targetUserMsg.model as ImageModelId)
      : 'agnes-image-2.5-flash';

    await runAssistantTurn({
      historyForApi,
      resolvedChatId: activeChatId || 'local_session',
      currentChatId: activeChatId,
      isFirstTurn: false,
      promptText: targetUserMsg.content,
      requestModel: activeModel,
      imageMode: isImageTurn,
      selectedImageModel,
      imageAttachments: targetUserMsg.localAttachments || [],
      baseMessages,
    });
  };

  const handleImageRecordCreated = async (record: ImageCreationRecord) => {
    if (!user) return;
    try {
      await saveImageCreation(user.uid, {
        id: record.id,
        prompt: record.prompt,
        model: record.model,
        aspectRatio: record.aspectRatio,
        imageSize: record.imageSize,
        mode: record.mode,
      });
    } catch (err) {
      console.error('Failed to persist creation metadata:', err);
    }
  };

  const handleSaveArtifact = async (item: {
    id: string;
    title: string;
    category: AgentCategory;
    prompt: string;
    summary: string;
    html: string;
    model: string;
    isUpdate?: boolean;
  }) => {
    const now = Date.now();
    if (!user) {
      setArtifacts((prev) => {
        const exists = prev.some((a) => a.id === item.id);
        if (exists) {
          return prev
            .map((a) =>
              a.id === item.id
                ? {
                    ...a,
                    title: item.title,
                    category: item.category,
                    prompt: item.prompt,
                    summary: item.summary,
                    html: item.html,
                    model: item.model,
                    updatedAtMs: now,
                  }
                : a
            )
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
        }
        return [
          {
            id: item.id,
            userId: 'local_guest',
            title: item.title,
            category: item.category,
            prompt: item.prompt,
            summary: item.summary,
            html: item.html,
            model: item.model,
            createdAtMs: now,
            updatedAtMs: now,
          },
          ...prev,
        ];
      });
      return;
    }

    await saveAgentArtifact(user.uid, item);
  };

  const handleDeleteArtifact = async (artifactId: string) => {
    if (!user) {
      setArtifacts((prev) => prev.filter((a) => a.id !== artifactId));
      return;
    }
    try {
      await deleteAgentArtifact(user.uid, artifactId);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to delete saved build.');
    }
  };

  const currentModelMeta =
    CHAT_MODELS.find((m) => m.id === activeModel) ?? CHAT_MODELS[0];

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex bg-white dark:bg-[#212121] text-[#0D0D0D] dark:text-[#ECECEC]">
      <Sidebar
        isOpen={sidebarOpen}
        onCloseMobile={() => setSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={handleSelectChat}
        onNewChat={handleNewChat}
        onDeleteChat={handleDeleteChat}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        user={user}
        authLoading={authLoading}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 min-w-0 flex flex-col safe-pt">
        {/* Top Bar with Model Selector & Workspace Navigation (Chat · Agent · Images) */}
        <header className="h-14 shrink-0 flex items-center justify-between gap-2 px-2.5 sm:px-5 border-b border-[#EBEBEB]/80 dark:border-[#2C2C2C]">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle sidebar"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer shrink-0"
            >
              <PanelLeft className="w-5 h-5" />
            </button>

            {(activeTab === 'chat' || activeTab === 'agent') ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setModelDropdownOpen((o) => !o)}
                  className="min-h-[38px] flex items-center gap-1 px-2 sm:px-2.5 rounded-xl text-xs sm:text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span className="max-w-[92px] sm:max-w-none truncate">{currentModelMeta.label}</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
                </button>

                {modelDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-20"
                      onClick={() => setModelDropdownOpen(false)}
                    />
                    <div className="absolute left-0 top-full mt-1.5 z-30 w-72 sm:w-80 rounded-2xl border border-[#E5E5E5] dark:border-[#363636] bg-white dark:bg-[#2A2A2A] shadow-xl p-1.5 space-y-0.5">
                      {CHAT_MODELS.map((m) => {
                        const selected = m.id === activeModel;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              handleChangeModel(m.id);
                              setModelDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors cursor-pointer ${
                              selected
                                ? 'bg-[#F4F4F4] dark:bg-[#383838]'
                                : 'hover:bg-[#F9F9F9] dark:hover:bg-[#323232]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-[#0D0D0D] dark:text-white">
                                {m.label}
                              </span>
                              {selected && (
                                <Check className="w-4 h-4 text-[#0D0D0D] dark:text-white shrink-0" />
                              )}
                            </div>
                            <p className="text-xs text-[#737373] dark:text-[#A4A4A4] mt-0.5">
                              {m.tagline}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span className="hidden sm:inline text-sm font-semibold text-[#0D0D0D] dark:text-[#ECECEC] truncate">
                Agnes Image Studio
              </span>
            )}
          </div>

          {/* Top Section Switcher Above Workspace */}
          <nav
            aria-label="Workspace sections"
            className="flex-1 min-w-0 flex items-center justify-start sm:justify-center overflow-x-auto no-scrollbar"
          >
            <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-[#F3F3F3] dark:bg-[#2A2A2A] border border-[#E6E6E6]/80 dark:border-[#353535]">
              {(
                [
                  { id: 'chat', label: 'Chat', icon: MessageSquare },
                  { id: 'agent', label: 'Agent', icon: Code2 },
                  { id: 'images', label: 'Images', icon: ImageIcon },
                ] as const
              ).map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`min-h-[32px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      selected
                        ? 'bg-white dark:bg-[#3A3A3A] text-[#0D0D0D] dark:text-white shadow-xs'
                        : 'text-[#666666] dark:text-[#A8A8A8] hover:text-[#0D0D0D] dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setActiveTab('chat');
                handleNewChat();
              }}
              aria-label="New chat"
              title="New chat"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#F4F4F4] dark:hover:bg-[#2F2F2F] transition-colors cursor-pointer"
            >
              <SquarePen className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            activeModel={activeModel}
            systemInstruction={systemInstruction}
            onChangeSystemInstruction={handleChangeSystemInstruction}
            isStreaming={isStreaming}
            onSendMessage={handleSendMessage}
            onStopStreaming={() => abortControllerRef.current?.abort()}
            onRegenerate={handleRegenerateLastResponse}
            onRetryLast={handleRegenerateLastResponse}
            errorBanner={errorBanner}
            onDismissError={() => setErrorBanner(null)}
          />
        )}

        {activeTab === 'agent' && (
          <AgentView
            activeModel={activeModel}
            savedArtifacts={artifacts}
            onSaveArtifact={handleSaveArtifact}
            onDeleteArtifact={handleDeleteArtifact}
          />
        )}

        {activeTab === 'images' && (
          <ImageStudioView
            history={creations}
            onRecordCreated={handleImageRecordCreated}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AfterAiWorkspace />
    </ErrorBoundary>
  );
}
