import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected application error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('After AI ErrorBoundary:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMessage = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed.error) {
          friendlyMessage = `Database permission or sync issue (${parsed.operationType ?? 'read'} on ${parsed.path ?? 'collection'}): ${parsed.error}`;
        }
      } catch {
        // Plain error message
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAF9F5] dark:bg-[#191918] px-6">
          <div className="max-w-lg w-full rounded-xl border border-[#E5E3DD] dark:border-[#2E2D2A] bg-white dark:bg-[#22211F] p-8">
            <h1 className="font-serif-display text-2xl font-medium text-[#1F1E1C] dark:text-[#ECEBE6] mb-3">
              Something interrupted After AI
            </h1>
            <p className="text-sm text-[#615F59] dark:text-[#A8A59E] leading-relaxed mb-6 break-words">
              {friendlyMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-[#C85A32] text-white hover:bg-[#B44D28] transition-colors cursor-pointer"
            >
              Reload workspace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
