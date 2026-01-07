import React from 'react'
import { Paper, IconButton, TextField, Box, Tooltip, CircularProgress, Badge, Chip } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import AssignmentIcon from '@mui/icons-material/Assignment'
import RateReviewIcon from '@mui/icons-material/RateReview'
import PollIcon from '@mui/icons-material/Poll'

interface MobileChatBarProps {
  value: string
  onChange: (v: string)=> void
  onSend: ()=> void
  canSend: boolean
  isRecording: boolean
  onStartRecording: ()=> void
  onStopRecording: ()=> void
  disabled?: boolean
  isLoading?: boolean
  onToggleAttachments?: ()=> void
  attachmentsCount?: number
  attachmentsOpen?: boolean
  onOpenFormDialog?: ()=> void
  starterPrompts?: string[]
  onPromptClick?: (prompt: string)=> void
  onOpenFeedback?: ()=> void
  onOpenSurvey?: ()=> void
}

// Compact bottom action bar for small screens
const MobileChatBar: React.FC<MobileChatBarProps> = ({ value, onChange, onSend, canSend, isRecording, onStartRecording, onStopRecording, disabled, isLoading, onToggleAttachments, attachmentsCount = 0, attachmentsOpen = false, onOpenFormDialog, starterPrompts, onPromptClick, onOpenFeedback, onOpenSurvey }) => {
  return (
    <Paper elevation={6} sx={{ 
      position:'fixed', bottom:0, left:0, right:0, 
      p: 2, 
      borderRadius:0, 
      display:'flex', 
      flexDirection: 'column',
      gap: 1.5, 
      zIndex: (theme)=> theme.zIndex.appBar,
      bgcolor: '#ffffff',
      borderTop: '1px solid #eee'
    }}>
      
      {/* Starter Prompts Scroll Area */}
      {starterPrompts && starterPrompts.length > 0 && (
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          overflowX: 'auto', 
          pb: 1, 
          scrollbarWidth: 'none', 
          '&::-webkit-scrollbar': { display: 'none' } 
        }}>
          {starterPrompts.map((prompt, idx) => {
            const isCmd = prompt.startsWith('CMD:OPEN_FORM|')
            const parts = isCmd ? prompt.split('|') : []
            const label = isCmd ? (parts[1] || 'Form') : prompt
            return (
              <Chip 
                key={idx} 
                label={label} 
                onClick={() => onPromptClick && onPromptClick(prompt)} 
                variant="outlined" 
                clickable
                color="primary"
                sx={{ whiteSpace: 'nowrap' }}
              />
            )
          })}
        </Box>
      )}

      {/* Row 1: Main Input Area (Full Width) */}
      <Box sx={{ width: '100%' }}>
        <TextField
          value={value}
          onChange={e=> onChange(e.target.value)}
          placeholder={isRecording ? 'Registra...' : 'Scrivi un messaggio...'}
          size="small"
          fullWidth
          multiline
          maxRows={4}
          disabled={disabled}
          onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onSend() } }}
          sx={{ 
            '& .MuiOutlinedInput-root': { 
              borderRadius: 3, 
              bgcolor: '#f2f4f7', 
              py: 1.5,
              px: 2,
              fontSize: '1rem',
              '& fieldset': { border: 'none' }, // Remove default border
              '&.Mui-focused': {
                 bgcolor: '#eef1f6',
                 boxShadow: '0 0 0 2px rgba(25, 118, 210, 0.2)' 
              }
            },
            '& .MuiOutlinedInput-input': {
              padding: 0
            }
          }}
        />
      </Box>

      {/* Row 2: Action Buttons (Justified) */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        
        {/* Left Actions */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {onToggleAttachments && (
            <IconButton
              size="medium"
              onClick={onToggleAttachments}
              color={attachmentsOpen || attachmentsCount>0 ? 'primary' : 'default'}
              sx={{ width: 44, height: 44, bgcolor: '#f5f5f5' }}
            >
              <Badge color="primary" badgeContent={attachmentsCount || 0} overlap="circular" max={9} invisible={attachmentsCount === 0}>
                <AttachFileIcon fontSize="medium" />
              </Badge>
            </IconButton>
          )}
          {onOpenFormDialog && (
            <IconButton
              size="medium"
              onClick={onOpenFormDialog}
              color="primary"
              sx={{ width: 44, height: 44, bgcolor: '#f5f5f5' }}
            >
              <AssignmentIcon fontSize="medium" />
            </IconButton>
          )}
        </Box>

        {/* Right Actions */}
        <Box sx={{ display: 'flex', gap: 1 }}>
          <IconButton
            size="medium"
            onClick={isRecording ? onStopRecording : onStartRecording}
            color={isRecording ? 'error' : 'primary'}
            sx={{ width: 44, height: 44, bgcolor: isRecording ? '#ffebee' : '#f5f5f5' }}
          >
            {isRecording ? <StopIcon fontSize="medium" /> : <MicIcon fontSize="medium" />}
          </IconButton>
          <IconButton
            size="medium"
            onClick={() => onSend()}
            disabled={!canSend}
            color="primary"
            sx={{ 
              width: 44, 
              height: 44,
              bgcolor: canSend ? '#1976d2' : '#f5f5f5', // Blue background for send if active
              color: canSend ? 'white' : undefined,
              '&:hover': { bgcolor: canSend ? '#1565c0' : '#eeeeee' }
            }}
          >
            {isLoading ? <CircularProgress size={20} color="inherit" /> : <SendIcon fontSize="medium" />}
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}

export default MobileChatBar
