import { useState, useMemo } from 'react'
import { marked } from 'marked'
import './FormattedAnswer.css'

// Configure marked options
marked.setOptions({
  gfm: true,
  breaks: true,
})

/**
 * FormattedAnswer — Renders structured markdown with code block copy buttons,
 * bold highlights, and clean typography for interview answers.
 */
export default function FormattedAnswer({ content = '', isStreaming = false }) {
  const [copiedId, setCopiedId] = useState(null)

  // Parse markdown into HTML and inject copy-friendly wrappers
  const parsedHtml = useMemo(() => {
    if (!content) return ''
    try {
      return marked.parse(content)
    } catch (e) {
      console.warn('Failed to parse markdown:', e)
      return content
    }
  }, [content])

  // Handle code block copy events delegation
  const handleContainerClick = (e) => {
    const btn = e.target.closest('.code-copy-btn')
    if (!btn) return

    const codeBlock = btn.closest('.code-block-wrapper')?.querySelector('code')
    if (!codeBlock) return

    const codeText = codeBlock.innerText || codeBlock.textContent || ''
    const blockId = btn.getAttribute('data-block-id') || 'default'

    navigator.clipboard.writeText(codeText).then(() => {
      setCopiedId(blockId)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(err => {
      console.error('Copy failed:', err)
    })
  }

  // Pre-process HTML to wrap <pre><code> with a custom header and copy button
  const processedHtml = useMemo(() => {
    if (!parsedHtml) return ''
    let blockIndex = 0
    return parsedHtml.replace(
      /<pre><code(?:\s+class="language-([a-zA-Z0-9_-]+)")?>([\s\S]*?)<\/code><\/pre>/gi,
      (match, lang, codeContent) => {
        blockIndex++
        const blockId = `code-blk-${blockIndex}`
        const displayLang = (lang || 'code').toUpperCase()
        const isCopied = copiedId === blockId

        return `
          <div class="code-block-wrapper" data-lang="${displayLang}">
            <div class="code-block-header">
              <span class="code-lang-tag">${displayLang}</span>
              <button type="button" class="code-copy-btn ${isCopied ? 'copied' : ''}" data-block-id="${blockId}" title="Copy code">
                ${isCopied ? '✓ Copied' : '⧉ Copy'}
              </button>
            </div>
            <pre><code class="language-${lang || 'text'}">${codeContent}</code></pre>
          </div>
        `
      }
    )
  }, [parsedHtml, copiedId])

  return (
    <div
      className={`formatted-answer-container ${isStreaming ? 'is-streaming' : ''}`}
      onClick={handleContainerClick}
      dangerouslySetInnerHTML={{ __html: processedHtml }}
    />
  )
}
