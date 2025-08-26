/**
 * Client-side cryptography utilities for message encryption/decryption
 * Implements AES-256-GCM encryption with PBKDF2 key derivation
 */

export class ChatCrypto {
  private userKey: CryptoKey | null = null;
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  /**
   * Deriva una chiave crittografica dalla password dell'utente
   */
  async deriveKeyFromPassword(password: string, email: string): Promise<CryptoKey> {
    // Usa email come salt per consistenza tra dispositivi
    const salt = this.encoder.encode(email);
    
    // Importa password come chiave per PBKDF2
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      this.encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    // Deriva chiave AES-256-GCM
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    this.userKey = key;
    return key;
  }

  /**
   * Genera hash della chiave utente (compatibile con backend)
   */
  async generateUserKeyHash(password: string, email: string): Promise<string> {
    const salt = this.encoder.encode(email);
    const passwordBuffer = this.encoder.encode(password);
    
    // Usa PBKDF2 per generare hash consistente con backend
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const keyBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      passwordKey,
      256
    );

    // Converti in hex
    const keyArray = new Uint8Array(keyBits);
    return Array.from(keyArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Cripta un messaggio
   */
  async encryptMessage(message: string): Promise<string> {
    if (!this.userKey) {
      throw new Error('User key not initialized. Call deriveKeyFromPassword first.');
    }

    const messageData = this.encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // GCM raccomanda 12 byte IV

    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      this.userKey,
      messageData
    );

    // Combina IV + dati crittografati
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    // Ritorna base64
    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Decripta un messaggio
   */
  async decryptMessage(encryptedMessage: string): Promise<string> {
    if (!this.userKey) {
      throw new Error('User key not initialized. Call deriveKeyFromPassword first.');
    }

    try {
      // Decodifica base64
      // Verifica pattern base64 (grezzo) per evitare eccezioni
      const base64Pattern = /^[A-Za-z0-9+/=]+$/;
      if (!base64Pattern.test(encryptedMessage) || encryptedMessage.length < 24) {
        // Probabilmente non cifrato: restituisci come testo in chiaro
        return encryptedMessage;
      }
      let combined: Uint8Array;
      try {
        combined = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
      } catch (e) {
        // Non base64 valido – ritorna originale
        return encryptedMessage;
      }
      
      // Estrai IV (primi 12 byte) e dati crittografati
      const iv = combined.slice(0, 12);
      const encryptedData = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        this.userKey,
        encryptedData
      );

  return this.decoder.decode(decrypted);
    } catch (error) {
  // Invece di generare errore blocco UI, restituiamo placeholder
  return '[Messaggio non decrittabile]';
    }
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
    return this.userKey !== null;
  }

  /**
   * Pulisce la chiave dalla memoria
   */
  clearKey(): void {
    this.userKey = null;
  }
}

/**
 * Gestione sicura delle credenziali utente
 */
export class CredentialManager {
  private static readonly TOKEN_KEY = 'qsa_access_token';
  private static readonly REFRESH_KEY = 'qsa_refresh_token';
  private static readonly USER_KEY = 'qsa_user_info';

  /**
   * Salva token di autenticazione
   */
  static saveTokens(accessToken: string, refreshToken: string, userInfo: any): void {
    localStorage.setItem(this.TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_KEY, refreshToken);
    localStorage.setItem(this.USER_KEY, JSON.stringify(userInfo));
  }

  /**
   * Recupera access token
   */
  static getAccessToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  /**
   * Recupera refresh token
   */
  static getRefreshToken(): string | null {
    return localStorage.getItem(this.REFRESH_KEY);
  }

  /**
   * Recupera info utente
   */
  static getUserInfo(): any | null {
    const userInfo = localStorage.getItem(this.USER_KEY);
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
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  /**
   * Aggiorna access token
   */
  static updateAccessToken(newToken: string): void {
    localStorage.setItem(this.TOKEN_KEY, newToken);
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
