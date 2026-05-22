// Unified Markdown preparation pipeline for chat rendering
// - Preserves fenced code blocks
// - Normalizes newlines and headings spacing
// - Cleans and fixes GFM tables (single header separator, no body separator rows)
// - Injects doc:// links for bare [DOC filename] references when matching RAG chunks

import { sanitizeChatMarkdown } from './markdownSanitizer'
import { injectDocLinks } from './docLinks'
import type { RagChunk } from './docLinks'

function normalizeMarkdownForDisplay(md: string): string {
  if (!md) return md
  let out = md
    .replace(/\\n/g, '\n') // unescape literal \n
    .replace(/\r\n?/g, '\n') // normalize CRLF

  // Collapse 3+ blank lines
  out = out.replace(/\n{3,}/g, '\n\n')
  return out
}

function isSeparatorLine(line: string, expectedCols?: number): boolean {
  const trimmed = line.trim()
  if (!/\|/.test(trimmed)) return false
  const parts = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim())
  const allSep = parts.every(p => /^:?-{3,}:?$/.test(p))
  if (!allSep) return false
  return expectedCols ? parts.length === expectedCols : true
}

function sanitizeTables(md: string): string {
  if (!md) return md

  // Protect code fences
  const codeBlocks: string[] = []
  let text = md.replace(/```[a-zA-Z0-9]*\n[\s\S]*?\n```/g, (m) => {
    const i = codeBlocks.push(m) - 1
    return `@@CODEBLOCK_${i}@@`
  })

  const lines = text.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    // Detect start of a table block (header row with at least one pipe)
    if (/\|/.test(line)) {
      const block: string[] = []
      let j = i
      while (j < lines.length) {
        const l = lines[j]
        if (!l.trim()) break
        if (!/\|/.test(l)) break
        block.push(l)
        j++
      }
      if (block.length > 0) {
        const fixed = fixPipeTableBlock(block)
        out.push(...fixed)
        i = j
        continue
      }
    }
    out.push(line)
    i++
  }
  text = out.join('\n')

  // Restore code blocks
  text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (_, n) => codeBlocks[Number(n)] || '')
  return text
}

function fixPipeTableBlock(block: string[]): string[] {
  if (block.length === 0) return block

  // Normalize cells by trimming around pipes and ensuring leading/trailing pipes
  const norm = block.map((l) => {
    const body = l.replace(/^\|?\s*/, '').replace(/\s*\|?$/, '')
    const cells = body.split('|').map(c => c.trim())
    return '| ' + cells.join(' | ') + ' |'
  })

  const header = norm[0]
  const colCount = header.split('|').length - 2 // because of leading/trailing pipes
  const result: string[] = []

  result.push(header)
  // Ensure exactly one separator line right after header
  if (norm.length < 2 || !isSeparatorLine(norm[1], colCount)) {
    result.push('| ' + Array(colCount).fill('---').join(' | ') + ' |')
  } else {
    result.push(norm[1])
  }

  // Push body rows, skipping rows that are only dashes (visual separators)
  for (let k = 2; k < norm.length; k++) {
    const row = norm[k]
    if (isSeparatorLine(row, colCount)) continue // drop extra separators inside body
    // drop rows whose every cell is only dashes
    const cells = row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim())
    const onlyDashes = cells.every(c => c === '' || /^:?-{2,}:?$/.test(c))
    if (onlyDashes) continue
    result.push(row)
  }
  return result
}

function normalizeSourceLinks(md: string): string {
  if (!md) return md

  // Protect code fences
  const codeBlocks: string[] = []
  let text = md.replace(/```[a-zA-Z0-9]*\n[\s\S]*?\n```/g, (m) => {
    const i = codeBlocks.push(m) - 1
    return `@@CODEBLOCK_${i}@@`
  })

  const normalizeUrl = (rawUrl: string) => {
    const trimmed = (rawUrl || '').trim()
    if (!trimmed) return null
    const trailingMatch = trimmed.match(/([).,;:!?]+)$/)
    const trailing = trailingMatch ? trailingMatch[1] : ''
    const core = trailing ? trimmed.slice(0, -trailing.length) : trimmed
    const cleanedCore = core.startsWith('.') ? core.slice(1) : core
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(cleanedCore)
    const looksLikeDomain = /^[a-z0-9.-]+\.[a-z]{2,}(\/\S*)?$/i.test(cleanedCore)
    if (!hasScheme && !looksLikeDomain) return null
    const href = hasScheme ? cleanedCore : `https://${cleanedCore}`
    return { display: cleanedCore, href, trailing }
  }

  text = text.replace(/\[(fonte)\s*:\s*([^\]\(]+?)\](?!\()/gi, (match, label, rawUrl) => {
    const normalized = normalizeUrl(rawUrl)
    if (!normalized) return match
    return `[${label}: ${normalized.display}](${normalized.href})${normalized.trailing}`
  })

  text = text.replace(/(^|[\s(])((?:fonte|link)\s*:\s*)([^\s\]\)]+)(?=$|[\s\)])/gi, (match, lead, label, rawUrl) => {
    const normalized = normalizeUrl(rawUrl)
    if (!normalized) return match
    return `${lead}[${label}${normalized.display}](${normalized.href})${normalized.trailing}`
  })

  text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (_, n) => codeBlocks[Number(n)] || '')
  return text
}

export function prepareChatMarkdown(raw: string, ragChunks?: RagChunk[]): string {
  let s = sanitizeChatMarkdown(raw)
  s = normalizeMarkdownForDisplay(s)
  s = sanitizeTables(s)
  s = normalizeSourceLinks(s)
  s = injectDocLinks(s, ragChunks)
  return s
}

// Plain-text conversion for TTS or exports
export function toPlainText(input: string): string {
  if (!input) return ''
  let text = input
  // Strip fenced code blocks entirely
  text = text.replace(/```[\s\S]*?```/g, ' ')
  // Inline code → plain
  text = text.replace(/`([^`]+)`/g, '$1')
  // Images and links → label
  text = text.replace(/!\[([^\]]*)\]\([^\)]*\)/g, '$1')
  text = text.replace(/\[([^\]]+)\]\(([^\)]+)\)/g, '$1')
  // Headings, quotes, lists → plain
  text = text.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  text = text.replace(/^\s{0,3}>\s?/gm, '')
  text = text.replace(/^\s{0,3}[-*+]\s+/gm, '')
  text = text.replace(/^\s{0,3}\d+\.\s+/gm, '')
  // Table separators and horizontal rules
  text = text.replace(/^\s*\|?\s*:?[-]{2,}:?\s*(\|\s*:?[-]{2,}:?\s*)+\|?\s*$/gm, '')
  text = text.replace(/^\s*[-]{3,}\s*$/gm, '')
  // Pipes to bullets
  text = text.replace(/\|/g, ' • ')
  // Strip HTML tags
  text = text.replace(/<[^>]+>/g, '')
  // Bold/italic
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1')
  text = text.replace(/\*([^*]+)\*/g, '$1')
  text = text.replace(/__([^_]+)__/g, '$1')
  text = text.replace(/_([^_]+)_/g, '$1')
  // Spaces and excessive newlines
  text = text.replace(/[ \t\f\v]+/g, ' ')
  text = text.replace(/\n{3,}/g, '\n\n')
  return text.trim()
}
