import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

/**
 * Converts user-authored markdown to sanitized HTML for preview rendering.
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown) as string
  return DOMPurify.sanitize(html)
}

/**
 * Produces a readable plain-text summary for layout sizing and compact labels.
 */
export function summarizeMarkdown(markdown: string): string {
  return markdown
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
