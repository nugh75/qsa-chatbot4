import React, { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
  Paper,
  Typography,
  Chip,
  LinearProgress,
  Alert,
  Button,
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  Description as PdfIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { authFetch } from '../utils/authFetch';

export interface ProcessedFile {
  id: string;
  filename: string;
  file_type: string;
  mime_type: string;
  size: number;
  content?: string;
  processed_at: string;
  error?: string;
}

interface FileUploadProps {
  onFilesProcessed: (files: ProcessedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFilesProcessed,
  maxFiles = 5,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supportedTypes = {
    'application/pdf': { label: 'PDF', icon: <PdfIcon /> },
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { label: 'Word', icon: <PdfIcon /> },
    'application/msword': { label: 'Word', icon: <PdfIcon /> },
    'text/plain': { label: 'TXT', icon: <PdfIcon /> },
    'text/markdown': { label: 'MD', icon: <PdfIcon /> },
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (files.length > maxFiles) {
      setError(`Massimo ${maxFiles} file consentiti per upload`);
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });

      const response = await authFetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Errore HTTP: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.error) {
        setError(result.error);
        return;
      }

      const newFiles: ProcessedFile[] = result.files || [];
      setProcessedFiles(newFiles);
      onFilesProcessed(newFiles);
      
    } catch (error) {
      console.error('Errore durante l\'upload:', error);
      setError('Errore durante il processamento dei file');
    } finally {
      setUploading(false);
      // Reset input file
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeFile = (fileId: string) => {
    const updatedFiles = processedFiles.filter(f => f.id !== fileId);
    setProcessedFiles(updatedFiles);
    onFilesProcessed(updatedFiles);
  };

  const getFileIcon = (mimeType: string) => {
    return supportedTypes[mimeType as keyof typeof supportedTypes]?.icon || <PdfIcon />;
  };

  const getFileLabel = (mimeType: string) => {
    return supportedTypes[mimeType as keyof typeof supportedTypes]?.label || 'File';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSupportedFormats = () => {
    return Object.values(supportedTypes).map(type => type.label).join(', ');
  };

  return (
    <Box>
      {/* Upload button */}
      <Tooltip title={`Carica file supportati: ${getSupportedFormats()}`}>
        <IconButton
          onClick={handleFileSelect}
          disabled={disabled || uploading}
          color="primary"
          sx={{
            border: '2px dashed',
            borderColor: 'primary.main',
            borderRadius: 2,
            padding: 2,
            '&:hover': {
              backgroundColor: 'primary.50',
            },
          }}
        >
          <AttachFileIcon fontSize="large" />
        </IconButton>
      </Tooltip>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".pdf,.docx,.doc,.txt,.md"
        style={{ display: 'none' }}
      />

      {/* Upload progress */}
      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Processamento file in corso...
          </Typography>
        </Box>
      )}

      {/* Error message */}
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}

      {/* File list */}
      {processedFiles.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, display: 'block' }}>
            File caricati ({processedFiles.length}):
          </Typography>
          
          {processedFiles.map((file) => (
            <Paper key={file.id} sx={{ p: 2, mb: 1, bgcolor: 'grey.50' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  {getFileIcon(file.mime_type)}
                  <Box sx={{ ml: 1, flex: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                      {file.filename}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip 
                        label={getFileLabel(file.mime_type)} 
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
                    </Box>
                  </Box>
                </Box>
                <IconButton 
                  size="small" 
                  onClick={() => removeFile(file.id)}
                  color="error"
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
              
              {file.error && (
                <Alert severity="warning" sx={{ mt: 1 }}>
                  Errore: {file.error}
                </Alert>
              )}
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default FileUpload;
