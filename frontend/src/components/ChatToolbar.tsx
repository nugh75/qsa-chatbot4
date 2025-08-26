import React from 'react';
import {
  Stack,
  CircularProgress,
  IconButton,
} from '@mui/material';
import {
  Send as SendIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  Add as AddIcon,
} from '@mui/icons-material';

interface ChatToolbarProps {
  onSend: () => void;
  onStartRecording: () => void;
  onStopRecording?: () => void;
  canSend: boolean;
  isRecording: boolean;
  isLoading: boolean;
}

const ChatToolbar: React.FC<ChatToolbarProps> = ({
  onSend,
  onStartRecording,
  onStopRecording,
  canSend,
  isRecording,
  isLoading
}) => {
  
  const handleMicClick = () => {
    if (isRecording && onStopRecording) {
      onStopRecording();
    } else {
      onStartRecording();
    }
  };

  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <IconButton
        onClick={onSend}
        disabled={!canSend || isLoading}
        color="primary"
        size="small"
        sx={{ 
          borderRadius: 2,
          width: 36,
          height: 36
        }}
      >
        {isLoading ? <CircularProgress size={16} /> : <SendIcon />}
      </IconButton>

      <IconButton
        onClick={handleMicClick}
        disabled={isLoading}
        color={isRecording ? "error" : "primary"}
        size="small"
        sx={{ 
          borderRadius: 2,
          width: 36,
          height: 36
        }}
      >
        {isRecording ? <StopIcon /> : <MicIcon />}
      </IconButton>
    </Stack>
  );
};

export default ChatToolbar;
