import { IconButton, Tooltip } from '@mui/material'
import DownloadIcon from '@mui/icons-material/Download'
import { apiService } from '../apiService'
import { useState } from 'react'

interface DownloadChatButtonProps {
  messages: Array<{role:'user'|'assistant'|'system', content:string, ts:number}>
  conversationId?: string | null
}

export function DownloadChatButton({ messages, conversationId }: DownloadChatButtonProps){
  const [isDownloading, setIsDownloading] = useState(false)
  
  const onClick = async () => {
    if (isDownloading) return
    
    setIsDownloading(true)
    try {
      if (conversationId) {
        // Usa nuovo endpoint con report
        const blob = await apiService.downloadConversationWithReport(conversationId)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `conversation-${conversationId}-with-report.zip`
        a.click(); URL.revokeObjectURL(url)
        return
      }
      // Fallback locale: solo chat corrente
      const blob = new Blob([JSON.stringify(messages,null,2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `chat-${new Date().toISOString()}.json`
      a.click(); URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error('Download chat failed', e)
      // Show user-friendly error
      const errorMsg = e.message || 'Download failed'
      if (errorMsg.includes('not authenticated') || errorMsg.includes('Authentication expired')) {
        alert('Please log in to download conversations with reports. You can still download the current chat.')
        // Fallback to local download
        try {
          const blob = new Blob([JSON.stringify(messages,null,2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `chat-${new Date().toISOString()}.json`
          a.click(); URL.revokeObjectURL(url)
        } catch {
          alert('Failed to download chat')
        }
      } else {
        alert(`Download failed: ${errorMsg}`)
      }
    } finally {
      setIsDownloading(false)
    }
  }
  
  return (
    <Tooltip title={conversationId ? 'Scarica chat + report' : 'Scarica chat'}>
      <IconButton 
        onClick={onClick} 
        aria-label="download-chat"
        disabled={isDownloading}
        sx={{ opacity: isDownloading ? 0.6 : 1 }}
      >
        <DownloadIcon/>
      </IconButton>
    </Tooltip>
  )
}
