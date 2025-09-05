import React from 'react';
import {
  Stack,
  CircularProgress,
  IconButton,
  Badge,
  Tooltip,
} from '@mui/material';
import {
  Send as SendIcon,
  Mic as MicIcon,
  Stop as StopIcon,
  AttachFile as AttachFileIcon,
} from '@mui/icons-material';
import AssignmentIcon from '@mui/icons-material/Assignment';

interface ChatToolbarProps {
  onSend: () => void;
  onStartRecording: () => void;
  onStopRecording?: () => void;
  canSend: boolean;
  isRecording: boolean;
  isLoading: boolean;
  onToggleAttachments?: () => void;
  attachmentsCount?: number;
  attachmentsOpen?: boolean;
  onOpenFormDialog?: () => void;
}

const ChatToolbar: React.FC<ChatToolbarProps> = ({
  onSend,
  onStartRecording,
  onStopRecording,
  canSend,
  isRecording,
  isLoading,
  onToggleAttachments,
  attachmentsCount = 0,
  attachmentsOpen = false,
  onOpenFormDialog
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
      {onToggleAttachments && (
        <Tooltip title={attachmentsOpen ? 'Nascondi allegati' : (attachmentsCount ? 'Mostra allegati' : 'Aggiungi allegati')}>
          <span>
            <IconButton
              onClick={onToggleAttachments}
              disabled={isLoading}
              color={attachmentsOpen || attachmentsCount>0 ? 'primary' : 'default'}
              size="small"
              sx={{ borderRadius: 2, width: 36, height: 36 }}
            >
              <Badge
                color="primary"
                badgeContent={attachmentsCount || 0}
                overlap="circular"
                max={9}
                invisible={attachmentsCount === 0}
              >
                <AttachFileIcon fontSize="small" />
              </Badge>
            </IconButton>
          </span>
        </Tooltip>
      )}
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

      {onOpenFormDialog && (
        <Tooltip title="Questionari">
          <span>
            <IconButton
              onClick={onOpenFormDialog}
              disabled={isLoading}
              color={'primary'}
              size="small"
              sx={{ borderRadius: 2, width: 36, height: 36 }}
            >
              <AssignmentIcon />
            </IconButton>
          </span>
        </Tooltip>
      )}

      <IconButton
        onClick={handleMicClick}
        disabled={isLoading}
        color={isRecording ? 'error' : 'primary'}
        size="small"
        sx={{ borderRadius: 2, width: 36, height: 36 }}
      >
        {isRecording ? <StopIcon /> : <MicIcon />}
      </IconButton>
    </Stack>
  );
};

export default ChatToolbar;
