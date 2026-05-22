import { IconButton, Tooltip, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import ArticleIcon from '@mui/icons-material/Article'
import { apiService } from '../apiService'
import { useState } from 'react'

interface DownloadChatButtonProps {
  messages: Array<{role:'user'|'assistant'|'system', content:string, ts:number}>
  conversationId?: string | null
  conversationTitle?: string | null
}

function slugify(s: string){
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9àèéìòùç\s_-]/g,'')
    .replace(/\s+/g,'-')
    .replace(/-+/g,'-')
    .slice(0,80) || 'chat'
}

function timestamp(){
  const d = new Date()
  const pad = (n:number)=>String(n).padStart(2,'0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

export function DownloadChatButton({ messages, conversationId, conversationTitle }: DownloadChatButtonProps){
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const open = Boolean(anchorEl)
  const openMenu = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)
  const closeMenu = () => setAnchorEl(null)

  const buildBaseName = () => {
    const base = `${timestamp()}_${slugify(conversationTitle || 'chat')}`
    return conversationId ? `${base}_${conversationId}` : base
  }

  const downloadPdf = async () => {
    if (!conversationId) { alert('Salva prima la conversazione per esportare PDF.'); return }
    setBusy(true)
    try {
      const blob = await apiService.downloadConversationPdf(conversationId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${buildBaseName()}_report.pdf`
      a.click(); URL.revokeObjectURL(url)
    } catch (e:any){
      alert('Download PDF fallito: ' + (e.message||e))
    } finally { setBusy(false); closeMenu() }
  }

  const downloadTxt = async () => {
    setBusy(true)
    try {
      // Serializza messaggi in testo semplice
      const lines = messages.map(m=>`[${new Date(m.ts).toISOString()}] ${m.role.toUpperCase()}\n${m.content}\n`).join('\n')
      const blob = new Blob([lines], { type: 'text/plain; charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${buildBaseName()}.txt`
      a.click(); URL.revokeObjectURL(url)
    } catch (e:any){
      alert('Download TXT fallito: ' + (e.message||e))
    } finally { setBusy(false); closeMenu() }
  }

  return (
    <>
      <Tooltip title="Export">
        <IconButton aria-label="export-menu" onClick={openMenu} disabled={busy} size="small">
          <MoreVertIcon />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={open} onClose={closeMenu} anchorOrigin={{vertical:'bottom', horizontal:'right'}}>
        <MenuItem onClick={downloadPdf} disabled={busy || !conversationId}>
          <ListItemIcon><PictureAsPdfIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Scarica PDF chat" secondary={conversationId ? undefined : 'Richiede salvataggio'} />
        </MenuItem>
        <MenuItem onClick={downloadTxt} disabled={busy}>
          <ListItemIcon><ArticleIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Scarica TXT chat" />
        </MenuItem>
      </Menu>
    </>
  )
}
