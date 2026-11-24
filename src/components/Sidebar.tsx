import React, { useState } from 'react';
import {
  MessageSquare,
  Image as ImageIcon,
  SquarePen,
  Trash2,
  Sun,
  Moon,
  LogIn,
  LogOut,
  Search,
  PanelLeftClose,
  Code2,
} from 'lucide-react';
import { ChatSession, WorkspaceTab } from '../types';
import { User } from 'firebase/auth';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  chats: ChatSession[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  user: User | null;
  authLoading: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onCloseMobile,
  activeTab,
  onSelectTab,
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  theme,
  onToggleTheme,
  user,
  authLoading,
  onSignIn,
  onSignOut,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredChats = searchQuery.trim()
    ? chats.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : chats;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-[268px] shrink-0 flex flex-col bg-[#F9F9F9] dark:bg-[#171717] border-r border-[#EBEBEB] dark:border-[#2A2A2A] transition-transform duration-200 ease-out safe-pt safe-pb ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:hidden'
        }`}
      >
        {/* Top Row: Brand + New Chat / Close */}
        <div className="flex items-center justify-between px-3.5 h-14 shrink-0">
          <button
            type="button"
            onClick={() => {
              onSelectTab('chat');
              onNewChat();
              onCloseMobile();
            }}
            className="flex items-center gap-2.5 min-h-[40px] px-1.5 rounded-lg hover:bg-[#ECECEC] dark:hover:bg-[#242424] transition-colors cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] flex items-center justify-center shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
              >
                <path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9" />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight text-[#0D0D0D] dark:text-[#ECECEC] whitespace-nowrap">
              After AI
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                onSelectTab('chat');
                onNewChat();
                onCloseMobile();
              }}
              aria-label="New chat"
              title="New chat"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#ECECEC] dark:hover:bg-[#242424] transition-colors cursor-pointer"
            >
              <SquarePen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close sidebar"
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#ECECEC] dark:hover:bg-[#242424] transition-colors cursor-pointer lg:hidden"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Workspace Navigation */}
        <div className="px-2.5 pb-2 space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectTab('chat');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 min-h-[42px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-[#ECECEC] dark:bg-[#262626] text-[#0D0D0D] dark:text-white'
                : 'text-[#555555] dark:text-[#B4B4B4] hover:bg-[#EFEFEF] dark:hover:bg-[#212121]'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Chat</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('agent');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 min-h-[42px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'agent'
                ? 'bg-[#ECECEC] dark:bg-[#262626] text-[#0D0D0D] dark:text-white'
                : 'text-[#555555] dark:text-[#B4B4B4] hover:bg-[#EFEFEF] dark:hover:bg-[#212121]'
            }`}
          >
            <Code2 className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Agent</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('images');
              onCloseMobile();
            }}
            className={`w-full flex items-center gap-2.5 px-3 min-h-[42px] rounded-xl text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'images'
                ? 'bg-[#ECECEC] dark:bg-[#262626] text-[#0D0D0D] dark:text-white'
                : 'text-[#555555] dark:text-[#B4B4B4] hover:bg-[#EFEFEF] dark:hover:bg-[#212121]'
            }`}
          >
            <ImageIcon className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">Agnes Image Studio</span>
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 min-h-0 flex flex-col px-2.5 pt-2 border-t border-[#EBEBEB]/80 dark:border-[#262626]">
          <div className="px-2 py-1.5 text-xs font-medium text-[#737373] dark:text-[#8E8E8E]">
            History
          </div>

          {chats.length > 3 && (
            <div className="relative mb-2 px-1">
              <Search className="w-3.5 h-3.5 text-[#8E8E8E] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg bg-white dark:bg-[#212121] border border-[#E5E5E5] dark:border-[#303030] text-[#0D0D0D] dark:text-[#ECECEC] placeholder-[#8E8E8E] focus:outline-none focus:border-[#0D0D0D] dark:focus:border-white/50"
              />
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
            {!user ? (
              <div className="px-2.5 py-3 text-xs text-[#737373] dark:text-[#8E8E8E] leading-relaxed">
                Sign in with Google below to save and sync your conversations across Android, tablet, and desktop.
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-[#737373] dark:text-[#8E8E8E]">
                {searchQuery ? 'No matching chats.' : 'No saved chats yet.'}
              </div>
            ) : (
              filteredChats.map((chat) => {
                const isActive = activeTab === 'chat' && activeChatId === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group flex items-center justify-between gap-1 px-2.5 min-h-[38px] rounded-xl text-sm transition-colors ${
                      isActive
                        ? 'bg-[#ECECEC] dark:bg-[#262626] text-[#0D0D0D] dark:text-white font-medium'
                        : 'text-[#4A4A4A] dark:text-[#B8B8B8] hover:bg-[#EFEFEF] dark:hover:bg-[#212121]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectTab('chat');
                        onSelectChat(chat.id);
                        onCloseMobile();
                      }}
                      className="flex-1 min-w-0 text-left truncate py-1.5 cursor-pointer"
                      title={chat.title}
                    >
                      {chat.title}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      aria-label={`Delete ${chat.title}`}
                      className="opacity-70 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 p-1.5 rounded-lg text-[#737373] hover:text-red-500 transition-opacity cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer: Google Sign-In, Theme, Attribution */}
        <div className="p-3 border-t border-[#EBEBEB] dark:border-[#2A2A2A] space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            {authLoading ? (
              <div className="h-10 flex-1 rounded-xl bg-[#ECECEC] dark:bg-[#262626] animate-pulse" />
            ) : user ? (
              <div className="flex items-center justify-between gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User avatar'}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover shrink-0 border border-black/10 dark:border-white/10"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] text-xs font-semibold flex items-center justify-center shrink-0">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#0D0D0D] dark:text-[#ECECEC] truncate">
                      {user.displayName || 'Google User'}
                    </p>
                    <p className="text-[11px] text-[#737373] dark:text-[#8E8E8E] truncate">
                      {user.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  aria-label="Sign out"
                  title="Sign out"
                  className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-xl text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#ECECEC] dark:hover:bg-[#262626] transition-colors cursor-pointer shrink-0"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignIn}
                className="flex-1 min-h-[40px] flex items-center justify-center gap-2 px-3 rounded-xl text-xs font-medium bg-[#0D0D0D] dark:bg-white text-white dark:text-[#0D0D0D] hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign in with Google</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-[#5D5D5D] dark:text-[#B4B4B4] hover:bg-[#ECECEC] dark:hover:bg-[#262626] transition-colors cursor-pointer shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          <p className="text-[11px] leading-snug text-[#737373] dark:text-[#8E8E8E] px-1">
            After AI by Hassnain Akhtar · CEO of HA Developers
          </p>
        </div>
      </aside>
    </>
  );
};
