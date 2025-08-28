import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { ChatCrypto, CredentialManager } from '../crypto';
import { createApiService } from '../types/api';

interface UserInfo {
  id: number;
  email: string;
  is_admin: boolean;
  created_at: string;
}

interface AuthContextType {
  user: UserInfo | null;
  crypto: ChatCrypto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsCryptoReauth: boolean; // Indica se è necessario riloggarsi per la crittografia
  mustChangePassword: boolean;
  login: (user: UserInfo, crypto: ChatCrypto) => void;
  logout: () => void;
  checkAuthStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Base backend URL (senza /api) + service per chiamate (aggiungeremo /api qui sotto)
const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005');
const API_BASE = `${BACKEND}/api`;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [crypto, setCrypto] = useState<ChatCrypto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsCryptoReauth, setNeedsCryptoReauth] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  // Usa sempre il prefisso /api per evitare 404 (/auth/me prima restituiva 404)
  const apiService = createApiService(API_BASE);

  /**
   * Recupera token usando il CredentialManager unificato
   */
  const getStoredToken = (): string | null => {
    return CredentialManager.getAccessToken();
  };

  const clearStoredTokens = () => {
    CredentialManager.clearCredentials();
  };

  const checkAuthStatus = async () => {
    setIsLoading(true);
    
    try {
      const token = getStoredToken();
      
      if (!token) {
        setUser(null);
        setCrypto(null);
        return;
      }

      // Verifica token con backend
      const response = await apiService.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data) {
        // Salva user info in CredentialManager se non presente (per persistenza)
        const storedInfo = CredentialManager.getUserInfo();
        if (!storedInfo || storedInfo.id !== response.data.id) {
          CredentialManager.saveTokens(
            token!,
            CredentialManager.getRefreshToken() || '',
            response.data
          );
        }
        setUser(response.data);
        // Prova a ripristinare la chiave dalla sessione, se presente e coerente con l'utente
        try {
          const raw = sessionStorage.getItem('qsa_crypto_key_raw');
          const uemail = sessionStorage.getItem('qsa_crypto_key_user');
          if (raw && uemail && uemail === response.data.email) {
            const cryptoInst = new ChatCrypto();
            await cryptoInst.importKeyFromRaw(raw);
            setCrypto(cryptoInst);
            setNeedsCryptoReauth(false);
          } else {
            setCrypto(null);
            setNeedsCryptoReauth(true); // Utente autenticato ma senza chiave crypto
          }
        } catch (e) {
          console.warn('Ripristino chiave sessione fallito:', e);
          setCrypto(null);
          setNeedsCryptoReauth(true);
        }
        setMustChangePassword(!!response.data.must_change_password);
        // Non possiamo ricreare la chiave crittografica senza password – l'utente dovrà riloggarsi per operazioni di decrittazione se necessario
      } else {
        // Fallback: mantieni sessione locale se presente
        const storedInfo = CredentialManager.getUserInfo();
        if (storedInfo) {
          setUser(storedInfo);
          setNeedsCryptoReauth(true);
        } else {
          clearStoredTokens();
          setUser(null);
          setCrypto(null);
          setNeedsCryptoReauth(false);
          setMustChangePassword(false);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      // Non slogghiamo: usiamo user info locale se presente
      const storedInfo = CredentialManager.getUserInfo();
      if (storedInfo) {
        setUser(storedInfo);
        setNeedsCryptoReauth(true);
      } else {
        clearStoredTokens();
        setUser(null);
        setCrypto(null);
        setNeedsCryptoReauth(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const login = (userInfo: UserInfo, cryptoInstance: ChatCrypto) => {
    setUser(userInfo);
    setCrypto(cryptoInstance);
    setNeedsCryptoReauth(false); // Reset flag dopo login completo
    setMustChangePassword(false);
  };

  const logout = () => {
    setUser(null);
    setCrypto(null);
    setNeedsCryptoReauth(false);
    clearStoredTokens();
    // Rimuovi eventuale chiave salvata in sessione
    try {
      sessionStorage.removeItem('qsa_crypto_key_raw');
      sessionStorage.removeItem('qsa_crypto_key_user');
    } catch {}
    
    // Opzionale: notifica il backend del logout
    const token = getStoredToken();
    if (token) {
      apiService.post('/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(console.error);
    }
  };

  // Auto-check auth status on mount
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    user,
    crypto,
    // Considera l'utente autenticato se abbiamo user info; la chiave crypto può essere derivata solo dopo login (state separato)
    isAuthenticated: !!user,
    isLoading,
    needsCryptoReauth,
    mustChangePassword,
    login,
    logout,
    checkAuthStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
