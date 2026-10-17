import { renderMarkdown } from './markdown.ts';

const wired = new WeakSet<HTMLTextAreaElement>();
let nextHelp = 0;

export function wireMarkdownField(area: HTMLTextAreaElement): void {
  if (wired.has(area)) return;
  wired.add(area);

  const tools = document.createElement('div');
  tools.className = 'md-tools';
  const help = document.createElement('small');
  help.className = 'md-help';
  help.id = `md-help-${++nextHelp}`;
  help.textContent = 'Markdown: **bold**, *italic*, # Heading, - list, > quote, [text](https://example.com). Blank lines separate paragraphs; use ``` for code. HTML is shown as text.';
  area.setAttribute('aria-describedby', [area.getAttribute('aria-describedby'), help.id].filter(Boolean).join(' '));

  const preview = document.createElement('details');
  preview.className = 'md-preview';
  const summary = document.createElement('summary');
  summary.textContent = 'Preview formatting';
  const content = document.createElement('div');
  content.className = 'markdown';
  preview.append(summary, content);
  tools.append(help, preview);

  const draw = () => { content.innerHTML = area.value.trim() ? renderMarkdown(area.value) : '<p>Nothing written yet.</p>'; };
  preview.addEventListener('toggle', () => { if (preview.open) draw(); });
  area.addEventListener('input', () => { if (preview.open) draw(); });

  const label = area.closest('label');
  if (label) {
    const wrapper = document.createElement('div');
    wrapper.className = 'md-field';
    label.before(wrapper);
    wrapper.append(label, tools);
  } else {
    area.after(tools);
  }
}

export function wireMarkdownEditors(root: HTMLElement): void {
  root.querySelectorAll<HTMLTextAreaElement>('textarea[data-markdown]').forEach(wireMarkdownField);
}
