import { micromark } from 'micromark';
import { fromMarkdown } from 'mdast-util-from-markdown';

/** CommonMark with raw HTML escaped and unsafe link/image protocols disabled by micromark. */
export function renderMarkdown(source: string): string {
  return micromark(source);
}

interface TextNode {
  type: string;
  value?: string;
  alt?: string | null;
  children?: TextNode[];
}

/** Plain text for metadata and excerpts inside linked cards, where another link would be invalid. */
export function markdownText(source: string, limit?: number): string {
  const textOf = (node: TextNode): string => {
    if (node.type === 'definition') return '';
    if (node.type === 'image' || node.type === 'imageReference') return node.alt ?? '';
    if (node.type === 'break') return ' ';
    if (node.value !== undefined) return node.value;
    const inline = node.type === 'paragraph' || node.type === 'heading' || node.type === 'emphasis' || node.type === 'strong' || node.type === 'link' || node.type === 'linkReference';
    return (node.children ?? []).map(textOf).join(inline ? '' : ' ');
  };
  const text = textOf(fromMarkdown(source)).replace(/\s+/g, ' ').trim();
  return limit !== undefined && text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Keep the existing battle array, without flattening lists, quotes, code or hard line breaks. */
export function markdownParagraphs(source: string): string[] {
  return source.trim() ? source.replace(/\r\n?/g, '\n').split('\n\n') : [];
}
