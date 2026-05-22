// Utilities for document link handling in chat markdown and previews

export type RagChunk = { filename?: string; chunk_index?: number }

export function normalizeDocName(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/[\s_-]+/g, ' ')
    .replace(/\.(pdf|md|markdown|txt)$/i, '')
    .trim()
}

export function shouldInjectDocLink(name: string, ragChunks?: RagChunk[]): boolean {
  if (!name) return false
  const normSet = new Set((ragChunks || []).map(c => {
    const fn = c.filename || ''
    const base = fn.split('/').pop() || fn
    return normalizeDocName(base.split('_').pop() || base)
  }))
  const norm = normalizeDocName(name)
  return Array.from(normSet).some(f => f && (f === norm || f.includes(norm) || norm.includes(f)))
}

export function injectDocLinks(md: string, ragChunks?: RagChunk[]): string {
  if (!md) return md
  return md.replace(/\[DOC\s+([^\]\(]+?)\](?!\()/g, (match, inner) => {
    const raw = (inner || '').trim()
    if (!shouldInjectDocLink(raw, ragChunks)) return match
    return `[DOC ${raw}](doc://${encodeURIComponent(raw)})`
  })
}

