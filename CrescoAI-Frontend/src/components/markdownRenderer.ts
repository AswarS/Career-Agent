import MarkdownIt from 'markdown-it';

export const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

// Suppress inline images — generated media is displayed separately via the media[] field.
markdownRenderer.renderer.rules['image'] = () => '';
