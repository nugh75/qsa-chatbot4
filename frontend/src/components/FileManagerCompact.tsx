import React, { useState, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  LinearProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Stack
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Close as CloseIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { ProcessedFile } from './FileUpload';
import { authFetch } from '../utils/authFetch';

interface FileManagerProps {
  attachedFiles: ProcessedFile[];
  onFilesChange: (files: ProcessedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const FileManagerCompact: React.FC<FileManagerProps> = ({
  attachedFiles,
  onFilesChange,
  maxFiles = 3,
  disabled = false
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<ProcessedFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const processFiles = async (files: FileList) => {
    if (files.length + attachedFiles.length > maxFiles) {
      setError(`Massimo ${maxFiles} file consentiti. Hai già ${attachedFiles.length} file allegati.`);
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
      
      if (result.files && Array.isArray(result.files)) {
        const updatedFiles = [...attachedFiles, ...result.files];
        onFilesChange(updatedFiles);
      } else {
        throw new Error('Formato risposta non valido');
      }
    } catch (error) {
      console.error('Errore upload:', error);
      setError(error instanceof Error ? error.message : 'Errore durante il caricamento');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      await processFiles(files);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const removeFile = (fileId: string) => {
    const updatedFiles = attachedFiles.filter(f => f.id !== fileId);
    onFilesChange(updatedFiles);
  };

  const showPreview = (file: ProcessedFile) => {
    setPreviewFile(file);
  };

  const closePreview = () => {
    setPreviewFile(null);
  };

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 1,
          borderRadius: 4,  // Angoli più arrotondati
          border: '1px solid',
          borderColor: dragOver ? 'primary.main' : 'grey.200',
          bgcolor: dragOver ? 'primary.50' : 'grey.50',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          '&:hover': {
            borderColor: disabled ? 'grey.200' : 'primary.main',
            bgcolor: disabled ? 'grey.50' : 'primary.50',
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={disabled ? undefined : handleFileSelect}
      >
        {/* Header compatto */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Typography variant="body2" color="text.secondary" fontSize="0.85rem">
            File allegati {attachedFiles.length > 0 && `(${attachedFiles.length}/${maxFiles})`}
          </Typography>
          
          <Button
            variant="text"
            size="small"
            startIcon={<UploadIcon />}
            disabled={uploading || disabled}
            onClick={(e) => {
              e.stopPropagation();
              handleFileSelect();
            }}
            sx={{ 
              fontSize: '0.75rem',
              minHeight: 28,
              px: 1.5,
              textTransform: 'none'
            }}
          >
            Allega
          </Button>
        </Box>

        {/* Zona drop compatta */}
        {attachedFiles.length === 0 && (
          <Box textAlign="center" py={1}>
            <Typography variant="caption" color="text.secondary">
              Trascina file qui • PDF, Word, TXT, MD
            </Typography>
          </Box>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept=".pdf,.docx,.doc,.txt,.md"
          style={{ display: 'none' }}
        />

        {/* Upload Progress */}
        {uploading && (
          <Box sx={{ mb: 1 }}>
            <LinearProgress sx={{ height: 3 }} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Caricamento...
            </Typography>
          </Box>
        )}

        {/* Error Message */}
        {error && (
          <Alert severity="error" sx={{ mb: 1, py: 0.5 }} onClose={() => setError(null)}>
            <Typography variant="caption">{error}</Typography>
          </Alert>
        )}

        {/* File List compatta */}
        {attachedFiles.length > 0 && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {attachedFiles.map((file) => (
              <Chip
                key={file.id}
                label={file.filename}
                size="small"
                variant="outlined"
                onDelete={() => removeFile(file.id)}
                onClick={() => showPreview(file)}
                deleteIcon={<CloseIcon />}
                sx={{ 
                  borderRadius: 2,
                  '& .MuiChip-label': {
                    fontSize: '0.75rem',
                    maxWidth: 120,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }
                }}
              />
            ))}
          </Stack>
        )}
      </Paper>

      {/* Preview Dialog */}
      <Dialog 
        open={!!previewFile} 
        onClose={closePreview}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" component="div">
            {previewFile?.filename}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography 
            variant="body2" 
            sx={{ 
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              lineHeight: 1.4,
              maxHeight: 400,
              overflow: 'auto',
              p: 2,
              bgcolor: 'grey.50',
              borderRadius: 2
            }}
          >
            {previewFile?.content || 'Contenuto non disponibile'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreview} size="small">
            Chiudi
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FileManagerCompact;
