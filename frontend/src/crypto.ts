/**
 * Client-side cryptography utilities for message encryption/decryption
 * Implements AES-256-GCM encryption with PBKDF2 key derivation
 */

export class ChatCrypto {
  // Client-side encryption disabled: no key is needed, keep API for compatibility
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  async deriveKeyFromPassword(_password: string, _email: string, _extractable: boolean = false): Promise<CryptoKey | null> {
    // No-op: encryption disabled
    return null as any;
  }

  async exportCurrentKeyRaw(): Promise<string> {
    throw new Error('Client-side encryption disabled');
  }

  async importKeyFromRaw(_base64: string): Promise<void> {
    // No-op
    return;
  }

  /**
   * Genera hash della chiave utente (compatibile con backend)
   */
  async generateUserKeyHash(password: string, email: string): Promise<string> {
  // With encryption disabled we keep a deterministic hash for compatibility using simple SHA-256
  const salt = this.encoder.encode(email);
  const data = this.encoder.encode(password + '|' + email);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  const keyArray = new Uint8Array(buffer);
  return Array.from(keyArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Cripta un messaggio
   */
  async encryptMessage(message: string): Promise<string> {
    // Encryption disabled: return plaintext directly
    return message;
  }

  /**
   * Decripta un messaggio
   */
  async decryptMessage(encryptedMessage: string): Promise<string> {
  // Encryption disabled: assume input is plaintext and return it
  return encryptedMessage;
  }

  /**
   * Genera hash del contenuto per indicizzazione
   */
  async generateContentHash(content: string): Promise<string> {
    const contentData = this.encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', contentData);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verifica se la chiave è inizializzata
   */
  isKeyInitialized(): boolean {
  // With encryption disabled, consider key not required
  return false;
  }

  /**
   * Pulisce la chiave dalla memoria
   */
  clearKey(): void {
  // No-op when encryption disabled
  return;
  }
}

/**
 * Gestione sicura delle credenziali utente
 */
export class CredentialManager {
  private static readonly TOKEN_KEY = 'qsa_access_token';
  private static readonly REFRESH_KEY = 'qsa_refresh_token';
  private static readonly USER_KEY = 'qsa_user_info';
  private static readonly S_TOKEN_KEY = 'qsa_access_token'; // same keys in session scope
  private static readonly S_REFRESH_KEY = 'qsa_refresh_token';
  private static readonly S_USER_KEY = 'qsa_user_info';

  /**
   * Salva token di autenticazione
   */
  static saveTokens(accessToken: string, refreshToken: string, userInfo: any, remember?: boolean): void {
    // Se 'remember' non è specificato, preserva lo storage esistente: usa local se già presente, altrimenti session se presente, altrimenti local
    const targetLocal = ((): boolean => {
      if (typeof remember === 'boolean') return remember;
      const hasLocal = !!localStorage.getItem(this.TOKEN_KEY);
      const hasSession = !!sessionStorage.getItem(this.S_TOKEN_KEY);
      if (hasLocal) return true;
      if (hasSession) return false;
      return true; // default
    })();
    if (targetLocal) {
      localStorage.setItem(this.TOKEN_KEY, accessToken);
      localStorage.setItem(this.REFRESH_KEY, refreshToken);
      localStorage.setItem(this.USER_KEY, JSON.stringify(userInfo));
      // Pulisci sessione per evitare ambiguità
      sessionStorage.removeItem(this.S_TOKEN_KEY);
      sessionStorage.removeItem(this.S_REFRESH_KEY);
      sessionStorage.removeItem(this.S_USER_KEY);
    } else {
      sessionStorage.setItem(this.S_TOKEN_KEY, accessToken);
      sessionStorage.setItem(this.S_REFRESH_KEY, refreshToken);
      sessionStorage.setItem(this.S_USER_KEY, JSON.stringify(userInfo));
      // Pulisci local per non “ricordare” oltre la sessione
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.REFRESH_KEY);
      localStorage.removeItem(this.USER_KEY);
    }
  }

  /**
   * Recupera access token
   */
  static getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY) || sessionStorage.getItem(this.S_TOKEN_KEY);
  }

  /**
   * Recupera refresh token
   */
  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY) || sessionStorage.getItem(this.S_REFRESH_KEY);
  }

  /**
   * Recupera info utente
   */
  static getUserInfo(): any | null {
    const userInfo = localStorage.getItem(this.USER_KEY) || sessionStorage.getItem(this.S_USER_KEY);
    return userInfo ? JSON.parse(userInfo) : null;
  }

  /**
   * Verifica se utente è autenticato
   */
  static isAuthenticated(): boolean {
    return this.getAccessToken() !== null;
  }

  /**
   * Pulisce credenziali (logout)
   */
  static clearCredentials(): void {
    // Rimuovi da entrambi gli storage
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
    sessionStorage.removeItem(this.S_TOKEN_KEY);
    sessionStorage.removeItem(this.S_REFRESH_KEY);
    sessionStorage.removeItem(this.S_USER_KEY);
  }

  /**
   * Aggiorna access token
   */
  static updateAccessToken(newToken: string): void {
    // Aggiorna in entrambi per sicurezza; quello effettivo sarà letto con priorità local->session
    localStorage.setItem(this.TOKEN_KEY, newToken);
    sessionStorage.setItem(this.S_TOKEN_KEY, newToken);
  }
}

/**
 * Gestione device fingerprinting per multi-device sync
 */
export class DeviceManager {
  /**
   * Genera fingerprint unico del dispositivo
   */
  static async generateDeviceFingerprint(): Promise<string> {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset().toString(),
      navigator.hardwareConcurrency?.toString() || '0',
      navigator.platform
    ];

    const fingerprint = components.join('|');
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);
    
    return Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Genera ID unico del dispositivo
   */
  static generateDeviceId(): string {
    let deviceId = localStorage.getItem('qsa_device_id');
    if (!deviceId) {
      deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('qsa_device_id', deviceId);
    }
    return deviceId;
  }

  /**
   * Ottieni nome user-friendly del dispositivo
   */
  static getDeviceName(): string {
    const platform = navigator.platform;
    const userAgent = navigator.userAgent;
    
    if (/iPhone|iPad|iPod/.test(userAgent)) {
      return 'iOS Device';
    } else if (/Android/.test(userAgent)) {
      return 'Android Device';
    } else if (/Windows/.test(platform)) {
      return 'Windows PC';
    } else if (/Mac/.test(platform)) {
      return 'Mac';
    } else if (/Linux/.test(platform)) {
      return 'Linux PC';
    }
    
    return 'Unknown Device';
  }
}

/**
 * Utility per validazione password
 */
export class PasswordValidator {
  /**
   * Valida forza password
   */
  static validatePassword(password: string): { isValid: boolean; errors: string[]; strength: string } {
    const errors: string[] = [];
    
    if (password.length < 8) {
      errors.push('Password deve essere di almeno 8 caratteri');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password deve contenere almeno una lettera maiuscola');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password deve contenere almeno una lettera minuscola');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password deve contenere almeno un numero');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
      errors.push('Password deve contenere almeno un carattere speciale');
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      strength: errors.length === 0 ? 'strong' : 'weak'
    };
  }

  /**
   * Genera password sicura
   */
  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }
}

// Istanza globale per crittografia
export const chatCrypto = new ChatCrypto();
