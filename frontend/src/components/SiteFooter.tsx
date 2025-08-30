import React, { useEffect, useState } from 'react'
import { Box, Typography, Link, Stack } from '@mui/material'
import WorkOutlineIcon from '@mui/icons-material/WorkOutline'
import FolderIcon from '@mui/icons-material/Folder'
import LanguageIcon from '@mui/icons-material/Language'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import EmailIcon from '@mui/icons-material/Email'

// Tipo parziale (evita dipendenze circolari). Usa any per campi non necessari qui.
interface UiFooterSettings {
  footer_title?: string
  footer_text?: string
  research_project?: string
  repository_url?: string
  website_url?: string
  info_pdf_url?: string
  contact_email?: string
  show_research_project?: boolean
  show_repository_url?: boolean
  show_website_url?: boolean
  show_info_pdf_url?: boolean
  show_contact_email?: boolean
  show_footer_block?: boolean
}

interface PublicConfigResponse {
  success: boolean
  data?: {
    ui_settings?: UiFooterSettings
  }
}

const cache: { loaded: boolean; settings?: UiFooterSettings } = { loaded: false }

const markdownLite = (text: string): React.ReactNode => {
  if (!text) return null
  // Trasforma **bold**, *italic*, [link](url)
  const parts: React.ReactNode[] = []
  let remaining = text
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\)]+\))/
  while (remaining.length) {
    const match = remaining.match(regex)
    if (!match) { parts.push(remaining); break }
    const idx = match.index || 0
    if (idx > 0) parts.push(remaining.slice(0, idx))
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(<strong key={parts.length}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('*')) {
      parts.push(<em key={parts.length}>{token.slice(1, -1)}</em>)
    } else if (token.startsWith('[')) {
      const m = token.match(/\[([^\]]+)\]\(([^\)]+)\)/)
      if (m) parts.push(<Link key={parts.length} href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</Link>)
      else parts.push(token)
    } else {
      parts.push(token)
    }
    remaining = remaining.slice(idx + token.length)
  }
  return parts
}

const lineItem = (icon: React.ReactNode, content: React.ReactNode) => (
  <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ fontSize: '0.75rem' }}>
    <Box sx={{ mt: '2px', color: 'text.secondary', display: 'flex' }}>{icon}</Box>
    <Typography variant="caption" component="div" sx={{ lineHeight: 1.3 }}>{content}</Typography>
  </Stack>
)

export const SiteFooter: React.FC = () => {
  const [settings, setSettings] = useState<UiFooterSettings | null>(cache.loaded ? (cache.settings || null) : null)

  useEffect(() => {
    if (cache.loaded) return
    const load = async () => {
      try {
        const resp = await fetch('/api/config/public')
        const data = (await resp.json()) as PublicConfigResponse
        const ui = data?.data?.ui_settings
        if (data.success && ui) {
          cache.loaded = true
          cache.settings = ui
          setSettings(ui)
        } else if (ui) { // fallback even if success false
          cache.loaded = true
          cache.settings = ui
          setSettings(ui)
        }
      } catch (e) {
        // ignora
      }
    }
    load()
  }, [])

  const s = settings
  if (!s || s.show_footer_block === false) return null

  const lines: React.ReactNode[] = []
  if (s.show_research_project !== false && s.research_project) lines.push(lineItem(<WorkOutlineIcon fontSize="inherit" sx={{ fontSize: 14 }} />, s.research_project))
  if (s.show_repository_url !== false && s.repository_url) lines.push(lineItem(<FolderIcon fontSize="inherit" sx={{ fontSize: 14 }} />, <Link href={s.repository_url} target="_blank" rel="noopener noreferrer">Repository</Link>))
  if (s.show_website_url !== false && s.website_url) lines.push(lineItem(<LanguageIcon fontSize="inherit" sx={{ fontSize: 14 }} />, <Link href={s.website_url} target="_blank" rel="noopener noreferrer">Sito web</Link>))
  if (s.show_info_pdf_url !== false && s.info_pdf_url) lines.push(lineItem(<PictureAsPdfIcon fontSize="inherit" sx={{ fontSize: 14 }} />, <Link href={s.info_pdf_url} target="_blank" rel="noopener noreferrer">Informativa</Link>))
  if (s.show_contact_email !== false && s.contact_email) lines.push(lineItem(<EmailIcon fontSize="inherit" sx={{ fontSize: 14 }} />, <Link href={`mailto:${s.contact_email}`}>{s.contact_email}</Link>))

  if (!lines.length && !s.footer_title && !s.footer_text) return null

  // Layout desktop: elementi su una singola riga (wrap solo se necessario) con piccoli separatori
  return (
    <Box component="footer" sx={{ mt: 6, mb: 2, px: 2, py: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', display:'flex', flexDirection:'column', gap:1 }}>
        {(s.footer_title || s.footer_text) && (
          <Box sx={(theme)=>({
            display:'flex',
            flexDirection:{ xs:'column', md:'row' },
            alignItems:{ md:'center' },
            gap:1,
            flexWrap:'wrap'
          })}>
            {s.footer_title && (
              <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {s.footer_title}
              </Typography>
            )}
            {s.footer_text && (
              <Typography variant="caption" component="div" sx={{ whiteSpace: { xs:'pre-line', md:'normal' }, color: 'text.secondary', lineHeight: 1.4, flex:1, fontSize:'0.7rem' }}>
                {markdownLite(s.footer_text)}
              </Typography>
            )}
          </Box>
        )}
        {lines.length > 0 && (
          <Box sx={(theme)=>({
            display:'flex',
            flexDirection:{ xs:'column', sm:'row' },
            flexWrap:{ xs:'nowrap', sm:'wrap' },
            rowGap:0.5,
            columnGap:2,
            alignItems:{ sm:'center' },
            '& > *': { display:'flex', alignItems:'center' }
          })}>
            {lines.map((l,i)=> (
              <Box key={i} sx={{ display:'flex', alignItems:'center', pr:2, borderRight:(theme)=> ({ sm: i < lines.length-1 ? '1px solid '+theme.palette.divider : 'none' }), mb:{ xs:0.5, sm:0 } }}>
                {l}
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  )
}

export default SiteFooter
