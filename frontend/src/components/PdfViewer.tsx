import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, IconButton, Tooltip, LinearProgress } from '@mui/material';
import {
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Refresh as ResetIcon,
} from '@mui/icons-material';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist/types/src/pdf';
import type { RenderParameters } from 'pdfjs-dist/types/src/display/api';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';

GlobalWorkerOptions.workerSrc = workerSrc;

const MIN_SCALE = 0.75;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;
const DEFAULT_SCALE = 1.1;

interface PdfViewerProps {
  sourceUrl: string;
}

export const PdfViewer = ({ sourceUrl }: PdfViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState<number>(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resetView = useCallback(() => {
    setScale(DEFAULT_SCALE);
    setPageNumber(1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    const load = async () => {
      setLoading(true);
      setError(null);
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      docRef.current?.destroy();
      docRef.current = null;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
      setPageNumber(1);
      setPageCount(0);

      try {
        const response = await fetch(sourceUrl, { signal: abort.signal });
        if (!response.ok) {
          throw new Error(`Impossibile caricare il PDF (HTTP ${response.status})`);
        }
        const buffer = await response.arrayBuffer();
        if (cancelled) {
          return;
        }
        const task = getDocument({ data: buffer });
        loadingTaskRef.current = task;
        const doc = await task.promise;
        if (cancelled) {
          await task.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(doc.numPages);
        setPageNumber(1);
        setLoading(false);
        setError(null);
      } catch (err: any) {
        if (cancelled || err?.name === 'AbortError') {
          return;
        }
        console.warn('[PdfViewer] errore caricamento', err);
        setError(err?.message || 'Errore durante il caricamento del PDF');
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      abort.abort();
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      docRef.current?.destroy();
      docRef.current = null;
      loadingTaskRef.current?.destroy();
      loadingTaskRef.current = null;
    };
  }, [sourceUrl]);

  const renderPage = useCallback(
    async (doc: PDFDocumentProxy, pageIndex: number, currentScale: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) return;

      try {
        const page: PDFPageProxy = await doc.getPage(pageIndex);
        const viewport = page.getViewport({ scale: currentScale });
        const outputScale = window.devicePixelRatio || 1;
        canvas.width = viewport.width * outputScale;
        canvas.height = viewport.height * outputScale;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);

        renderTaskRef.current?.cancel();
        const renderContext: RenderParameters = {
          canvas,
          canvasContext: context,
          viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined,
        };
        const task = page.render(renderContext);
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (err: any) {
        if (err?.name === 'RenderingCancelledException') {
          return;
        }
        console.warn('[PdfViewer] errore rendering pagina', err);
        setError(err?.message || 'Errore durante il rendering del PDF');
      }
    },
    []
  );

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || pageNumber < 1 || pageNumber > doc.numPages) {
      return;
    }
    renderPage(doc, pageNumber, scale).catch(err => {
      console.warn('[PdfViewer] errore effetto render', err);
    });
  }, [pageNumber, scale, renderPage]);

  useEffect(() => {
    setScale(DEFAULT_SCALE);
    setPageNumber(1);
  }, [sourceUrl]);

  const disablePrev = pageNumber <= 1;
  const disableNext = pageNumber >= pageCount;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 1,
          gap: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Pagina precedente">
            <span>
              <IconButton size="small" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={disablePrev}>
                <PrevIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="body2">
            {pageCount ? `${pageNumber} di ${pageCount}` : 'Caricamento…'}
          </Typography>
          <Tooltip title="Pagina successiva">
            <span>
              <IconButton size="small" onClick={() => setPageNumber(p => Math.min(pageCount, p + 1))} disabled={disableNext}>
                <NextIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Zoom -">
            <span>
              <IconButton
                size="small"
                onClick={() => setScale(s => Math.max(MIN_SCALE, +(s - SCALE_STEP).toFixed(2)))}
                disabled={scale <= MIN_SCALE + 0.01}
              >
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="body2">{Math.round(scale * 100)}%</Typography>
          <Tooltip title="Zoom +">
            <span>
              <IconButton
                size="small"
                onClick={() => setScale(s => Math.min(MAX_SCALE, +(s + SCALE_STEP).toFixed(2)))}
                disabled={scale >= MAX_SCALE - 0.01}
              >
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton size="small" onClick={resetView}>
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {loading && <LinearProgress sx={{ mb: 1 }} />}
      {error && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {error}
        </Typography>
      )}

      <Box
        sx={{
          flex: 1,
          overflow: 'auto',
          border: theme => `1px solid ${theme.palette.divider}`,
          borderRadius: 1,
          bgcolor: 'grey.50',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          p: 1,
        }}
      >
        <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
      </Box>
    </Box>
  );
};

export default PdfViewer;
