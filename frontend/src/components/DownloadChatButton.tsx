import { IconButton, Tooltip } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'

export function DownloadChatButton({ messages }:{ messages: Array<{role:'user'|'assistant'|'system', content:string, ts:number}> }){
  const onClick = () => {
    const blob = new Blob([JSON.stringify(messages,null,2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `chat-${new Date().toISOString()}.json`
    a.click(); URL.revokeObjectURL(url)
  }
  return <Tooltip title="Scarica chat"><IconButton onClick={onClick} aria-label="download-chat"><DownloadIcon/></IconButton></Tooltip>
}
