export interface ParsedAgentArtifact {
  summary: string;
  htmlCode: string;
  isCodeStarted: boolean;
  isCodeComplete: boolean;
  title: string;
}

export function extractHtmlTitle(html: string, fallback = 'After AI Build'): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (match && match[1]) {
    const cleaned = match[1].replace(/\s+/g, ' ').trim().slice(0, 90);
    if (cleaned) return cleaned;
  }
  return fallback;
}

export function formatHtmlSize(html: string): string {
  const bytes = new Blob([html]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function extractAgentArtifact(
  rawText: string,
  fallbackTitle = 'After AI Build'
): ParsedAgentArtifact {
  const text = rawText || '';

  // Prefer explicit ```html fence or first fence containing HTML document
  const fenceStartRegex = /```(?:html|HTML)?\s*\r?\n/;
  const startMatch = fenceStartRegex.exec(text);

  if (startMatch) {
    const beforeFence = text.slice(0, startMatch.index).trim();
    const afterStartIdx = startMatch.index + startMatch[0].length;
    const rest = text.slice(afterStartIdx);
    const closingIdx = rest.search(/\r?\n```/);

    if (closingIdx !== -1) {
      const htmlCode = rest.slice(0, closingIdx).trim();
      const afterFence = rest.slice(closingIdx).replace(/^\r?\n```/, '').trim();
      const summary = [beforeFence, afterFence].filter(Boolean).join('\n\n').trim();
      return {
        summary,
        htmlCode,
        isCodeStarted: true,
        isCodeComplete: htmlCode.length > 0,
        title: extractHtmlTitle(htmlCode, fallbackTitle),
      };
    }

    return {
      summary: beforeFence,
      htmlCode: rest,
      isCodeStarted: true,
      isCodeComplete: false,
      title: extractHtmlTitle(rest, fallbackTitle),
    };
  }

  // Fallback: detect raw <!DOCTYPE html> or <html> without code fences
  const docTypeIdx = text.search(/<!doctype\s+html|<html[\s>]/i);
  if (docTypeIdx !== -1) {
    const beforeDoc = text.slice(0, docTypeIdx).trim();
    const rawHtmlTail = text.slice(docTypeIdx);
    const htmlEndMatch = /<\/html>/i.exec(rawHtmlTail);
    if (htmlEndMatch) {
      const endOffset = htmlEndMatch.index + htmlEndMatch[0].length;
      const htmlCode = rawHtmlTail.slice(0, endOffset).trim();
      const afterHtml = rawHtmlTail.slice(endOffset).trim();
      const summary = [beforeDoc, afterHtml].filter(Boolean).join('\n\n').trim();
      return {
        summary,
        htmlCode,
        isCodeStarted: true,
        isCodeComplete: true,
        title: extractHtmlTitle(htmlCode, fallbackTitle),
      };
    }

    const htmlCode = rawHtmlTail.trim();
    return {
      summary: beforeDoc,
      htmlCode,
      isCodeStarted: true,
      isCodeComplete: false,
      title: extractHtmlTitle(htmlCode, fallbackTitle),
    };
  }

  return {
    summary: text.trim(),
    htmlCode: '',
    isCodeStarted: false,
    isCodeComplete: false,
    title: fallbackTitle,
  };
}

export function downloadHtmlFile(html: string, title: string): void {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'after-ai-app';
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
