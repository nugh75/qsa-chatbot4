import React, { useState } from 'react';
import { Box, Button, TextField, Typography, Alert, Paper } from '@mui/material';
import { apiService } from '../apiService';

const DebugPipelineTest: React.FC = () => {
  const [pattern, setPattern] = useState('test_pattern_' + Date.now());
  const [topic, setTopic] = useState('test_topic_' + Date.now());
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testAddRoute = async () => {
    setLoading(true);
    setResult('');
    try {
      console.log(`[DebugPipelineTest] Testing addPipelineRoute with pattern="${pattern}", topic="${topic}"`);
      const res = await apiService.addPipelineRoute(pattern, topic);
      console.log('[DebugPipelineTest] Result:', res);
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('[DebugPipelineTest] Error:', e);
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const testGetConfig = async () => {
    setLoading(true);
    setResult('');
    try {
      console.log('[DebugPipelineTest] Testing getPipelineConfig');
      const res = await apiService.getPipelineConfig();
      console.log('[DebugPipelineTest] Config result:', res);
      setResult(JSON.stringify(res, null, 2));
    } catch (e) {
      console.error('[DebugPipelineTest] Error:', e);
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Debug Pipeline API Test
      </Typography>
      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          label="Pattern"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          fullWidth
          margin="normal"
          size="small"
        />
        <TextField
          label="Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          fullWidth
          margin="normal"
          size="small"
        />
        <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            onClick={testAddRoute}
            disabled={loading || !pattern || !topic}
          >
            Test Add Route
          </Button>
          <Button
            variant="outlined"
            onClick={testGetConfig}
            disabled={loading}
          >
            Test Get Config
          </Button>
        </Box>
      </Paper>
      
      {result && (
        <Alert severity={result.includes('Error') ? 'error' : 'info'} sx={{ mt: 2 }}>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
            {result}
          </pre>
        </Alert>
      )}
    </Box>
  );
};

export default DebugPipelineTest;
