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
  Image as ImageIcon,
  Close as CloseIcon,
} from '@mui/icons-material';

export interface ProcessedFile {
  id: string;
  filename: string;
  file_type: string;
  mime_type: string;
  size: number;
  content?: string;
  base64_data?: string;
  images?: Array<{
    page: number;
    index: number;
    base64_data: string;
    format: string;
    description: string;
    source: string;
  }>;
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
    'image/png': { label: 'PNG', icon: <ImageIcon /> },
    'image/jpeg': { label: 'JPEG', icon: <ImageIcon /> },
    'image/gif': { label: 'GIF', icon: <ImageIcon /> },
    'image/webp': { label: 'WebP', icon: <ImageIcon /> },
    'image/bmp': { label: 'BMP', icon: <ImageIcon /> },
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

      const response = await fetch('/api/file-upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Errore upload: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success && result.files) {
        setProcessedFiles(result.files);
        onFilesProcessed(result.files);
        
        if (result.errors && result.errors.length > 0) {
          setError(`Alcuni file non sono stati processati: ${result.errors.join(', ')}`);
        }
      } else {
        setError(result.errors?.[0] || 'Errore durante il processamento dei file');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      setError('Errore durante l\'upload dei file');
    } finally {
      setUploading(false);
      // Reset input
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

  const clearAllFiles = () => {
    setProcessedFiles([]);
    onFilesProcessed([]);
    setError(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    return supportedTypes[mimeType as keyof typeof supportedTypes]?.icon || <PdfIcon />;
  };

  const getFileLabel = (mimeType: string) => {
    return supportedTypes[mimeType as keyof typeof supportedTypes]?.label || 'File';
  };

  return (
    <Box>
      {/* Upload Button */}
      <Tooltip title="Carica file (PDF, Word, Immagini)">
        <IconButton
          onClick={handleFileSelect}
          disabled={disabled || uploading}
          size="small"
          sx={{ color: 'primary.main' }}
        >
          <AttachFileIcon />
        </IconButton>
      </Tooltip>

      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".pdf,.docx,.doc,.png,.jpg,.jpeg,.gif,.webp,.bmp"
        style={{ display: 'none' }}
      />

      {/* Upload progress */}
      {uploading && (
        <Box sx={{ mt: 1 }}>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">
            Caricamento e processamento file...
          </Typography>
        </Box>
      )}

      {/* Error display */}
      {error && (
        <Alert severity="warning" sx={{ mt: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Processed files display */}
      {processedFiles.length > 0 && (
        <Paper sx={{ mt: 2, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="subtitle2">
              File allegati ({processedFiles.length})
            </Typography>
            <Button size="small" onClick={clearAllFiles}>
              Rimuovi tutti
            </Button>
          </Box>
          
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {processedFiles.map((file) => (
              <Chip
                key={file.id}
                icon={getFileIcon(file.mime_type)}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="caption" noWrap sx={{ maxWidth: 120 }}>
                      {file.filename}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ({getFileLabel(file.mime_type)}, {formatFileSize(file.size)})
                    </Typography>
                  </Box>
                }
                deleteIcon={<CloseIcon />}
                onDelete={() => removeFile(file.id)}
                variant="outlined"
                size="small"
                sx={{ maxWidth: 250 }}
              />
            ))}
          </Box>

          {/* Show content preview for text files */}
          {processedFiles.some(f => f.content) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                ✅ Contenuto estratto e pronto per l'AI
              </Typography>
            </Box>
          )}

          {/* Show extracted images descriptions */}
          {processedFiles.some(f => f.images && f.images.length > 0) && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1, display: 'block' }}>
                📸 Immagini estratte e analizzate da GPT-4o mini:
              </Typography>
              {processedFiles
                .filter(f => f.images && f.images.length > 0)
                .map(file => (
                  <Box key={file.id} sx={{ mb: 2 }}>
                    <Typography variant="caption" color="primary" sx={{ fontWeight: 'bold' }}>
                      Da {file.filename}:
                    </Typography>
                    {file.images?.map((img: any, index: number) => (
                      <Box key={index} sx={{ ml: 2, mt: 1, p: 1, bgcolor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 'bold' }}>
                          Immagine {index + 1} ({img.source}):
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                          {img.description}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                ))
              }
            </Box>
          )}
        </Paper>
      )}
    </Box>
  );
};

export default FileUpload;
