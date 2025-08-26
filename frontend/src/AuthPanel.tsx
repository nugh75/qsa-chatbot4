/**
 * Login/Register component for authentication
 */
import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Tab,
  Tabs,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { apiService, handleApiError } from './apiService';
import { CredentialManager, PasswordValidator, chatCrypto, DeviceManager } from './crypto';

interface AuthPanelProps {
  onAuthSuccess: (userInfo: any) => void;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthSuccess }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
    setError('');
    setSuccess('');
  };

  const handleInputChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [field]: event.target.value
    }));
    setError('');
  };

  const validateForm = (): boolean => {
    if (!formData.email || !formData.password) {
      setError('Email e password sono obbligatori');
      return false;
    }

    if (activeTab === 1) { // Registrazione
      if (formData.password !== formData.confirmPassword) {
        setError('Le password non coincidono');
        return false;
      }

      const passwordValidation = PasswordValidator.validatePassword(formData.password);
      if (!passwordValidation.isValid) {
        setError(`Password non valida: ${passwordValidation.errors.join(', ')}`);
        return false;
      }
    }

    return true;
  };

  const handleLogin = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await apiService.login({
        email: formData.email,
        password: formData.password
      });

      if (response.success && response.data) {
        // Salva credenziali
        CredentialManager.saveTokens(
          response.data.access_token,
          response.data.refresh_token,
          { id: response.data.user_id, email: formData.email }
        );

        // Inizializza crittografia
        await chatCrypto.deriveKeyFromPassword(formData.password, formData.email);

        // Registra dispositivo
        const deviceId = DeviceManager.generateDeviceId();
        const deviceFingerprint = await DeviceManager.generateDeviceFingerprint();
        
        await apiService.registerDevice({
          device_id: deviceId,
          device_name: DeviceManager.getDeviceName(),
          device_fingerprint: deviceFingerprint
        });

        setSuccess('Login effettuato con successo!');
        onAuthSuccess({ id: response.data.user_id, email: formData.email });
      } else {
        setError(handleApiError(response.error || 'Login fallito'));
      }
    } catch (error) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError('');

    try {
      const response = await apiService.register({
        email: formData.email,
        password: formData.password
      });

      if (response.success && response.data) {
        // Salva credenziali
        CredentialManager.saveTokens(
          response.data.access_token,
          response.data.refresh_token,
          { id: response.data.user_id, email: formData.email }
        );

        // Inizializza crittografia
        await chatCrypto.deriveKeyFromPassword(formData.password, formData.email);

        // Registra dispositivo
        const deviceId = DeviceManager.generateDeviceId();
        const deviceFingerprint = await DeviceManager.generateDeviceFingerprint();
        
        await apiService.registerDevice({
          device_id: deviceId,
          device_name: DeviceManager.getDeviceName(),
          device_fingerprint: deviceFingerprint
        });

        setSuccess('Registrazione completata con successo!');
        onAuthSuccess({ id: response.data.user_id, email: formData.email });
      } else {
        setError(handleApiError(response.error || 'Registrazione fallita'));
      }
    } catch (error) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (activeTab === 0) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <Box
      display="flex"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      bgcolor="#f5f5f5"
      p={2}
    >
      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent>
          <Typography variant="h4" align="center" gutterBottom>
            QSA Chatbot
          </Typography>
          
          <Typography variant="h6" align="center" color="text.secondary" gutterBottom>
            Sistema di Chat Sicuro
          </Typography>

          <Tabs value={activeTab} onChange={handleTabChange} centered sx={{ mb: 3 }}>
            <Tab label="Accedi" />
            <Tab label="Registrati" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {success}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={handleInputChange('email')}
              margin="normal"
              required
              autoComplete="email"
            />

            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={handleInputChange('password')}
              margin="normal"
              required
              autoComplete={activeTab === 0 ? 'current-password' : 'new-password'}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            {activeTab === 1 && (
              <TextField
                fullWidth
                label="Conferma Password"
                type={showPassword ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={handleInputChange('confirmPassword')}
                margin="normal"
                required
                autoComplete="new-password"
              />
            )}

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, mb: 2 }}
            >
              {loading ? 'Caricamento...' : (activeTab === 0 ? 'Accedi' : 'Registrati')}
            </Button>
          </form>

          {activeTab === 1 && (
            <Typography variant="caption" display="block" textAlign="center" color="text.secondary">
              Le tue conversazioni saranno crittografate e sincronizzate su tutti i tuoi dispositivi.
              Solo tu puoi accedervi con la tua password.
            </Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};
