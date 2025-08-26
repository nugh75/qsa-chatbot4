import React from 'react';
import {
  Card,
  CardContent,
  Typography,
  IconButton,
  Chip,
  Box,
  Stack,
} from '@mui/material';
import {
  Description as PdfIcon,
  Close as CloseIcon,
  Visibility as PreviewIcon,
} from '@mui/icons-material';
import { ProcessedFile } from './FileUpload';

interface FilePreviewProps {
  file: ProcessedFile;
  onRemove: (fileId: string) => void;
  onPreview?: (file: ProcessedFile) => void;
}

const FilePreview: React.FC<FilePreviewProps> = ({ file, onRemove, onPreview }) => {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeIcon = (mimeType: string) => {
    return <PdfIcon color="primary" />;
  };

  const getFileTypeLabel = (mimeType: string) => {
    const types: Record<string, string> = {
      'application/pdf': 'PDF',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
      'application/msword': 'Word',
      'text/plain': 'Testo',
      'text/markdown': 'Markdown',
    };
    return types[mimeType] || 'File';
  };

  const getContentPreview = (content: string) => {
    if (!content) return 'Nessun contenuto estratto';
    const preview = content.substring(0, 100);
    return preview.length < content.length ? `${preview}...` : preview;
  };

  return (
    <Card sx={{ mb: 1, bgcolor: 'grey.50' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          {getFileTypeIcon(file.mime_type)}
          
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography 
              variant="subtitle2" 
              sx={{ fontWeight: 'bold', mb: 0.5 }}
              noWrap
            >
              {file.filename}
            </Typography>
            
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip 
                label={getFileTypeLabel(file.mime_type)} 
                size="small" 
                color="primary" 
                variant="outlined"
              />
              <Chip 
                label={formatFileSize(file.size)} 
                size="small" 
                variant="outlined"
              />
              {file.content && (
                <Chip 
                  label={`${file.content.length} caratteri`} 
                  size="small" 
                  color="success" 
                  variant="outlined"
                />
              )}
            </Stack>

            {file.content && (
              <Typography 
                variant="caption" 
                color="text.secondary"
                sx={{ 
                  display: 'block',
                  fontStyle: 'italic',
                  lineHeight: 1.3
                }}
              >
                {getContentPreview(file.content)}
              </Typography>
            )}

            {file.error && (
              <Typography 
                variant="caption" 
                color="error"
                sx={{ display: 'block', mt: 0.5 }}
              >
                Errore: {file.error}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {onPreview && file.content && (
              <IconButton 
                size="small" 
                onClick={() => onPreview(file)}
                color="primary"
                title="Anteprima contenuto"
              >
                <PreviewIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton 
              size="small" 
              onClick={() => onRemove(file.id)}
              color="error"
              title="Rimuovi file"
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
};

export default FilePreview;
