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
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
} from '@mui/icons-material';
import { ProcessedFile } from './FileUpload';
import FilePreview from './FilePreview';

interface FileManagerProps {
  attachedFiles: ProcessedFile[];
  onFilesChange: (files: ProcessedFile[]) => void;
  maxFiles?: number;
  disabled?: boolean;
}

const FileManager: React.FC<FileManagerProps> = ({
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

      const response = await fetch('/api/upload', {
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
      const updatedFiles = [...attachedFiles, ...newFiles];
      onFilesChange(updatedFiles);
      
    } catch (error) {
      console.error('Errore durante l\'upload:', error);
      setError('Errore durante il processamento dei file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await processFiles(files);
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

  const getSupportedFormats = () => {
    return 'PDF, Word (DOCX/DOC), Testo (TXT), Markdown (MD)';
  };

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          mb: 1,
          borderRadius: 3,
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
            <Box sx={{ mb: 2 }}>
              <LinearProgress />
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Processamento file in corso...
              </Typography>
            </Box>
          )}

          {/* Error Message */}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* File List */}
          {attachedFiles.length > 0 ? (
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                File caricati ({attachedFiles.length}):
              </Typography>
              {attachedFiles.map((file) => (
                <FilePreview
                  key={file.id}
                  file={file}
                  onRemove={removeFile}
                  onPreview={showPreview}
                />
              ))}
            </Box>
          ) : (!uploading && (
            <Typography 
              variant="body2" 
              color="text.secondary" 
              sx={{ textAlign: 'center', py: 2 }}
            >
              Nessun file allegato
            </Typography>
          ))}
      </Paper>

      {/* Preview Dialog */}
      <Dialog
        open={!!previewFile}
        onClose={closePreview}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Anteprima: {previewFile?.filename}</DialogTitle>
        <DialogContent dividers>
          <Typography 
            variant="body2" 
            sx={{ 
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
              bgcolor: 'grey.50',
              p: 2,
              borderRadius: 1,
              maxHeight: 400,
              overflow: 'auto'
            }}
          >
            {previewFile?.content || 'Nessun contenuto disponibile'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreview}>Chiudi</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FileManager;
