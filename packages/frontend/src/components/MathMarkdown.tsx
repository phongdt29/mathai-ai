'use client';

import { isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import FunctionGraph from '@/components/FunctionGraph';
import { normalizeMathDelimiters } from '@/lib/math-text';
import 'katex/dist/katex.min.css';

interface MathMarkdownProps {
  content: string;
  className?: string;
}

function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (isValidElement(node)) {
    return extractText((node.props as { children?: unknown }).children);
  }
  return '';
}

/**
 * Renders markdown text with LaTeX math support.
 *
 * Supports:
 * - Inline math: \(...\) or $...$
 * - Display math: \[...\] or $$...$$
 * - Function graphs: fenced ```graph blocks (JSON spec or "y = ..." lines)
 * - Standard markdown: headings, bold, italic, lists, code, etc.
 */
export default function MathMarkdown({ content, className }: MathMarkdownProps) {
  const normalized = normalizeMathDelimiters(content);

  return (
    <div className={className}>
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        // Style headings
        h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-1">{children}</h3>,
        // Style lists
        ul: ({ children }) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Style paragraphs
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        // Style strong/em
        strong: ({ children }) => <strong className="font-bold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        // Fenced ```graph blocks render as accurate function graphs
        pre: ({ children }) => {
          const child = Array.isArray(children) ? children[0] : children;
          if (
            isValidElement(child) &&
            typeof (child.props as { className?: string }).className === 'string' &&
            ((child.props as { className?: string }).className ?? '').includes('language-graph')
          ) {
            return <FunctionGraph source={extractText(child)} />;
          }
          return <pre>{children}</pre>;
        },
        // Style code
        code: ({ children, className: codeClassName }) => {
          const isBlock = codeClassName?.includes('language-');
          if (isBlock) {
            return (
              <code className="block bg-gray-100 rounded-lg p-3 text-sm font-mono overflow-x-auto my-2">
                {children}
              </code>
            );
          }
          return (
            <code className="bg-gray-100 rounded px-1.5 py-0.5 text-sm font-mono">
              {children}
            </code>
          );
        },
        // Style horizontal rules
        hr: () => <hr className="my-3 border-gray-200" />,
        // Style blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-300 pl-3 my-2 text-gray-600 italic">
            {children}
          </blockquote>
        ),
        img: ({ src, alt }) => (
          <figure className="my-3 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
            {/* Markdown image src is arbitrary/dynamic content; next/image is not applicable. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={typeof src === 'string' ? src : undefined}
              alt={alt ?? 'Ảnh minh họa'}
              className="mx-auto max-h-72 w-full object-contain p-3"
              loading="lazy"
              decoding="async"
            />
            {alt ? (
              <figcaption className="border-t border-gray-200 px-3 py-2 text-center text-sm text-gray-600">
                {alt}
              </figcaption>
            ) : null}
          </figure>
        ),
      }}
    >
      {normalized}
    </ReactMarkdown>
    </div>
  );
}
