// Utilities to support document previews and aggregation from RAG chunks

import type { RagChunk } from './docLinks'
import { normalizeDocName } from './docLinks'

export { normalizeDocName }

export function buildDocumentAggregate(name: string, ragChunks?: RagChunk[]): string {
  if (!ragChunks) return ''
  const decoded = decodeURIComponent(name)
  const target = normalizeDocName(decoded)
  const related = ragChunks.filter(c => {
    const fn = c.filename || ''
    const base = fn.split('/').pop() || fn
    const cleanedFull = normalizeDocName(base)
    const cleanedPartial = normalizeDocName(base.split('_').pop() || base)
    return [cleanedFull, cleanedPartial].some(cleaned => cleaned && (cleaned === target || cleaned.includes(target) || target.includes(cleaned)))
  })
  if (!related.length) return ''
  related.sort((a,b)=> (a.chunk_index||0) - (b.chunk_index||0))
  return related.map(c => `### Chunk ${c.chunk_index}\n${(c as any).content || (c as any).preview || ''}` ).join('\n\n')
}

export type PreviewType = 'pdf'|'markdown'|'text'

export function detectPreviewType(href: string): PreviewType {
  const lower = (href || '').toLowerCase()
  if (lower.endsWith('.pdf') || /\/api\/rag\/download\//.test(lower)) return 'pdf'
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown'
  if (lower.endsWith('.txt')) return 'text'
  return 'text'
}

export async function fetchTextTruncated(href: string, maxBytes = 200*1024, init?: RequestInit): Promise<string> {
  const headers = new Headers(init?.headers || {})
  const res = await fetch(href, {
    ...init,
    headers,
    credentials: init?.credentials ?? 'include'
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return text.length > maxBytes ? text.slice(0, maxBytes) + '\n\n[contenuto troncato]' : text
}
