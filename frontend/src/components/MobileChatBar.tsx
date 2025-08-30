import React from 'react'
import { Paper, IconButton, TextField, Box, Tooltip, CircularProgress } from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import MicIcon from '@mui/icons-material/Mic'
import StopIcon from '@mui/icons-material/Stop'

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
}

// Compact bottom action bar for small screens
const MobileChatBar: React.FC<MobileChatBarProps> = ({ value, onChange, onSend, canSend, isRecording, onStartRecording, onStopRecording, disabled, isLoading }) => {
  return (
    <Paper elevation={6} sx={{ position:'fixed', bottom:0, left:0, right:0, p:1, borderRadius:0, display:'flex', alignItems:'center', gap:1, zIndex: (theme)=> theme.zIndex.appBar }}>
  {/* Attachment icon removed for mobile UI cleanup */}
      <Box sx={{ flex:1 }}>
        <TextField
          value={value}
          onChange={e=> onChange(e.target.value)}
          placeholder={isRecording ? 'Sto registrando...' : 'Messaggio'}
          size="small"
          fullWidth
          multiline
          maxRows={4}
          disabled={disabled}
          onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onSend() } }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius:3, py:0.5 } }}
        />
      </Box>
      <IconButton
        size="small"
        onClick={isRecording ? onStopRecording : onStartRecording}
        color={isRecording ? 'error' : 'primary'}
        aria-label={isRecording ? 'ferma registrazione' : 'registra'}
        sx={{ width:44, height:44 }}
      >
        {isRecording ? <StopIcon fontSize="small" /> : <MicIcon fontSize="small" />}
      </IconButton>
      <Tooltip title={canSend ? 'Invia' : ''}>
        <span>
          <IconButton
            size="small"
            onClick={onSend}
            disabled={!canSend}
            color="primary"
            aria-label="invia"
            sx={{ width:44, height:44 }}
          >
            {isLoading ? <CircularProgress size={20} /> : <SendIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
    </Paper>
  )
}

export default MobileChatBar
