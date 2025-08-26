import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Person as PersonIcon,
  Lock as LockIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import { apiService } from '../apiService';
import { ChatCrypto, CredentialManager } from '../crypto';

interface LoginDialogProps {
  open: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserInfo, crypto: ChatCrypto) => void;
}

interface UserInfo {
  id: number;
  email: string;
  is_admin: boolean;
  created_at: string;
}

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface RegisterForm {
  email: string;
  password: string;
  confirmPassword: string;
}

const BACKEND = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8005';

const LoginDialog: React.FC<LoginDialogProps> = ({
  open,
  onClose,
  onLoginSuccess,
}) => {
  const [currentTab, setCurrentTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [loginForm, setLoginForm] = useState<LoginForm>({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (open) {
      // Reset form quando si apre
      setError(null);
      setLoginForm({ email: '', password: '', rememberMe: false });
      setRegisterForm({ email: '', password: '', confirmPassword: '' });
    }
  }, [open]);

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) {
      setError('Inserisci email e password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Chiama API di login
      const response = await apiService.login({
        email: loginForm.email,
        password: loginForm.password,
      });

      if (response.success && response.data?.access_token) {
        // Prima salva i token
        CredentialManager.saveTokens(
          response.data.access_token,
          response.data.refresh_token,
          {} // userInfo temporaneo, verrà aggiornato dopo
        );

        // Poi ottieni info utente (ora il token è disponibile)
        const userResponse = await apiService.getCurrentUser();

        if (userResponse.success && userResponse.data) {
          const userInfo: UserInfo = {
            id: userResponse.data.id,
            email: userResponse.data.email,
            is_admin: false, // TODO: add admin field to backend
            created_at: userResponse.data.created_at
          };

          // Aggiorna le informazioni utente salvate
          CredentialManager.saveTokens(
            response.data.access_token,
            response.data.refresh_token,
            userInfo
          );

          // Inizializza crypto con password utente
          const crypto = new ChatCrypto();
          await crypto.deriveKeyFromPassword(loginForm.password, loginForm.email);

          onLoginSuccess(userInfo, crypto);
          onClose();
        } else {
          setError('Errore nel recupero delle informazioni utente');
        }
      } else {
        setError(response.error || 'Credenziali non valide');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError('Errore durante il login');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.email || !registerForm.password || !registerForm.confirmPassword) {
      setError('Compila tutti i campi');
      return;
    }

    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }

    if (registerForm.password.length < 8) {
      setError('La password deve essere di almeno 8 caratteri');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Chiama API di registrazione
      console.log('📡 Attempting registration with:', {
        email: registerForm.email,
        password: registerForm.password.substring(0, 3) + '***'
      });
      
      const response = await apiService.register({
        email: registerForm.email,
        password: registerForm.password,
      });
      
      console.log('📡 Registration response:', response);

      if (response.success && response.data?.access_token) {
        console.log('✅ Registration successful, token received:', response.data.access_token.substring(0, 20) + '...');
        
        // Prima salva i token
        CredentialManager.saveTokens(
          response.data.access_token,
          response.data.refresh_token,
          {} // userInfo temporaneo, verrà aggiornato dopo
        );
        
        console.log('✅ Tokens saved to localStorage');
        console.log('🔍 Checking saved token:', CredentialManager.getAccessToken()?.substring(0, 20) + '...');

        // Poi ottieni info utente (ora il token è disponibile)
        console.log('📡 Calling getCurrentUser...');
        const userResponse = await apiService.getCurrentUser();
        console.log('📡 getCurrentUser response:', userResponse);

        if (userResponse.success && userResponse.data) {
          const userInfo: UserInfo = {
            id: userResponse.data.id,
            email: userResponse.data.email,
            is_admin: false, // TODO: add admin field to backend
            created_at: userResponse.data.created_at
          };

          // Aggiorna le informazioni utente salvate
          CredentialManager.saveTokens(
            response.data.access_token,
            response.data.refresh_token,
            userInfo
          );

          // Inizializza crypto
          const crypto = new ChatCrypto();
          await crypto.deriveKeyFromPassword(registerForm.password, registerForm.email);

          onLoginSuccess(userInfo, crypto);
          onClose();
        } else {
          setError('Errore nel recupero delle informazioni utente');
        }
      } else {
        setError(response.error || 'Errore durante la registrazione');
      }
    } catch (err: any) {
      console.error('Register error:', err);
      setError('Errore durante la registrazione');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentTab === 0) {
      handleLogin();
    } else {
      handleRegister();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" alignItems="center" gap={1}>
          <PersonIcon />
          Accesso Counselorbot
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Tabs value={currentTab} onChange={(_, newValue) => setCurrentTab(newValue)} sx={{ mb: 3 }}>
          <Tab label="Accedi" />
          <Tab label="Registrati" />
        </Tabs>

        <form onSubmit={handleSubmit}>
          {currentTab === 0 ? (
            // Login Tab
            <Box display="flex" flexDirection="column" gap={3}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon />
                    </InputAdornment>
                  ),
                }}
                required
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                required
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={loginForm.rememberMe}
                    onChange={(e) => setLoginForm(prev => ({ ...prev, rememberMe: e.target.checked }))}
                  />
                }
                label="Ricordami"
              />
            </Box>
          ) : (
            // Register Tab
            <Box display="flex" flexDirection="column" gap={3}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={registerForm.email}
                onChange={(e) => setRegisterForm(prev => ({ ...prev, email: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <EmailIcon />
                    </InputAdornment>
                  ),
                }}
                required
              />

              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={registerForm.password}
                onChange={(e) => setRegisterForm(prev => ({ ...prev, password: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                helperText="Minimo 8 caratteri"
                required
              />

              <TextField
                fullWidth
                label="Conferma Password"
                type={showPassword ? 'text' : 'password'}
                value={registerForm.confirmPassword}
                onChange={(e) => setRegisterForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon />
                    </InputAdornment>
                  ),
                }}
                required
              />

              <Typography variant="caption" color="text.secondary">
                Creando un account, le tue conversazioni saranno crittografate end-to-end
              </Typography>
            </Box>
          )}
        </form>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Annulla</Button>
        <Button
          variant="contained"
          onClick={currentTab === 0 ? handleLogin : handleRegister}
          disabled={loading}
          startIcon={loading && <CircularProgress size={16} />}
        >
          {loading ? 'Attendere...' : currentTab === 0 ? 'Accedi' : 'Registrati'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LoginDialog;
