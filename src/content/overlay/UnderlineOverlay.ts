import type { UnderlineIssue, UnderlineIssueType } from '../../lib/types';

const UNDERLINE_COLORS: Record<UnderlineIssueType, string> = {
  grammar: '#2563eb',
  spelling: '#dc2626',
  punctuation: '#ea580c',
  style: '#9333ea',
  'ai-tell': '#0d9488',
};

function underlineBackground(type: UnderlineIssueType): string {
  const stroke = UNDERLINE_COLORS[type] ?? UNDERLINE_COLORS.grammar;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3'><path d='M0 1.5 Q1.5 0 3 1.5 T6 1.5' stroke='${stroke}' fill='none' stroke-width='1.2'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export class UnderlineOverlay {
  private readonly container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'psc-overlay-container';
    this.container.setAttribute('data-polyscribe', 'underlines');
    this.container.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 2147483645;
    `;
    document.documentElement.appendChild(this.container);
  }

  drawUnderline(
    issue: UnderlineIssue,
    rects: DOMRect[],
    handlers: {
      onHover: (rect: DOMRect) => void;
      onLeave: () => void;
    },
  ): void {
    const bg = underlineBackground(issue.type);
    for (const rect of rects) {
      if (rect.width <= 0 && rect.height <= 0) continue;
      const underline = document.createElement('div');
      underline.className = `psc-underline psc-${issue.type}`;
      underline.dataset.issueId = issue.id;
      underline.style.cssText = `
        position: fixed;
        left: ${rect.left}px;
        top: ${rect.bottom - 2}px;
        width: ${Math.max(rect.width, 2)}px;
        height: 6px;
        pointer-events: auto;
        cursor: pointer;
        background-image: ${bg};
        background-repeat: repeat-x;
        background-size: 6px 3px;
      `;
      underline.addEventListener('mouseenter', () => handlers.onHover(rect));
      underline.addEventListener('mouseleave', () => handlers.onLeave());
      this.container.appendChild(underline);
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}
