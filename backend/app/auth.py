"""
Authentication system with JWT tokens and password security
"""
import jwt
import bcrypt
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
import hashlib
import os

# Configuration
# In sviluppo senza docker-compose vogliamo una chiave stabile anche senza variabile d'ambiente.
def _load_dev_secret() -> str:
    env_secret = os.getenv("JWT_SECRET_KEY")
    if env_secret:
        return env_secret
    # Usa file locale .jwt_secret nella root backend/app
    secret_path = os.path.join(os.path.dirname(__file__), '.jwt_secret')
    if os.path.exists(secret_path):
        try:
            with open(secret_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception:
            pass
    # Genera nuova chiave e salva per riusi futuri
    new_secret = secrets.token_urlsafe(48)
    try:
        with open(secret_path, 'w', encoding='utf-8') as f:
            f.write(new_secret)
    except Exception as e:
        print(f"[AUTH] Warning: could not persist dev secret: {e}")
    return new_secret

SECRET_KEY = _load_dev_secret()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 30

security = HTTPBearer()

# Pydantic models
class UserRegistration(BaseModel):
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None

class AuthManager:
    """Gestisce autenticazione, JWT tokens e sicurezza password"""
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hash password con bcrypt"""
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')
    
    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Verifica password contro hash"""
        try:
            return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))
        except:
            return False
    
    @staticmethod
    def generate_user_key_hash(password: str, email: str) -> str:
        """Genera hash della chiave utente per crittografia"""
        # PBKDF2 per derivare chiave stabile da password + email
        import hashlib
        key = hashlib.pbkdf2_hmac('sha256', 
                                 password.encode('utf-8'),
                                 email.encode('utf-8'),
                                 100000)  # 100k iterations
        return key.hex()
    
    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
        """Crea JWT access token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire, "type": "access"})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    @staticmethod
    def create_refresh_token(data: Dict[str, Any]) -> str:
        """Crea JWT refresh token"""
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
        to_encode.update({"exp": expire, "type": "refresh"})
        return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    @staticmethod
    def verify_token(token: str, token_type: str = "access") -> Optional[TokenData]:
        """Verifica e decodifica JWT token"""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            
            # Verifica tipo token
            if payload.get("type") != token_type:
                return None
            
            user_id: int = payload.get("sub")
            email: str = payload.get("email")
            
            if user_id is None:
                return None
            
            # Converti user_id da stringa a intero se necessario
            if isinstance(user_id, str):
                try:
                    user_id = int(user_id)
                except ValueError:
                    return None
                
            return TokenData(user_id=user_id, email=email)
        except jwt.PyJWTError as e:
            # Log minimale per debug (non stampare token completo)
            print(f"[AUTH] Token verification failed ({token_type}): {str(e)} - head={token.split('.',1)[0] if '.' in token else 'n/a'}")
            return None
    
    @staticmethod
    def is_user_locked(user_data: Dict[str, Any]) -> bool:
        """Verifica se l'utente è bloccato per troppi tentativi"""
        if user_data.get("failed_login_attempts", 0) >= MAX_LOGIN_ATTEMPTS:
            locked_until = user_data.get("locked_until")
            if locked_until:
                # Controlla se il blocco è ancora attivo
                lock_time = datetime.fromisoformat(locked_until.replace('Z', '+00:00'))
                if datetime.utcnow() < lock_time:
                    return True
        return False

# Dependency per autenticazione
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Dependency per ottenere l'utente corrente dal JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    token_data = AuthManager.verify_token(credentials.credentials)
    if token_data is None:
        raise credentials_exception
    
    # Importa qui per evitare import circolari
    from .database import UserModel
    user = UserModel.get_user_by_id(token_data.user_id)
    if user is None:
        raise credentials_exception
    
    return user

async def get_current_active_user(current_user: dict = Depends(get_current_user)):
    """Dependency per ottenere utente attivo"""
    if not current_user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")
    return current_user

def is_admin_user(user: dict) -> bool:
    """Controlla se l'utente ha privilegi di amministratore"""
    # Verifica se l'utente è admin tramite email o ruolo
    admin_emails = [
        "admin@qsa-chatbot.com",
        "desi76@example.com",  # Aggiungi qui email degli admin
    ]
    
    return (
        user.get("email") in admin_emails or 
        user.get("role") == "admin" or
        user.get("is_admin", False)
    )

# Funzioni per password reset con escrow
class EscrowManager:
    """Gestisce il sistema escrow per reset password amministratore"""
    
    @staticmethod
    def generate_escrow_key() -> str:
        """Genera chiave escrow per utente"""
        return secrets.token_urlsafe(32)
    
    @staticmethod
    def encrypt_with_escrow(data: str, escrow_key: str) -> str:
        """Cripta dati con chiave escrow (placeholder per vera implementazione)"""
        # Qui andrebbe implementata vera crittografia AES-256-GCM
        # Per ora ritorna placeholder
        import base64
        combined = f"{escrow_key}:{data}"
        return base64.b64encode(combined.encode()).decode()
    
    @staticmethod
    def decrypt_with_escrow(encrypted_data: str, escrow_key: str) -> Optional[str]:
        """Decripta dati con chiave escrow"""
        try:
            import base64
            decoded = base64.b64decode(encrypted_data.encode()).decode()
            stored_key, data = decoded.split(":", 1)
            if stored_key == escrow_key:
                return data
            return None
        except:
            return None
    
    @staticmethod
    def generate_recovery_password() -> str:
        """Genera password temporanea per recovery"""
        return secrets.token_urlsafe(12)
    
    @staticmethod
    def admin_reset_user_password(admin_email: str, target_email: str, 
                                new_password: str, escrow_key: str) -> bool:
        """Reset password utente da parte amministratore"""
        from .database import UserModel, AdminModel
        
        try:
            # Verifica esistenza utente
            user = UserModel.get_user_by_email(target_email)
            if not user:
                AdminModel.log_admin_action(
                    admin_email, "PASSWORD_RESET", None, target_email,
                    "User not found", None, False
                )
                return False
            
            # Hash nuova password
            new_password_hash = AuthManager.hash_password(new_password)
            new_user_key_hash = AuthManager.generate_user_key_hash(new_password, target_email)
            
            # Aggiorna password nel database
            from .database import db_manager
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE users 
                    SET password_hash = ?, user_key_hash = ?, failed_login_attempts = 0, locked_until = NULL
                    WHERE email = ?
                """, (new_password_hash, new_user_key_hash, target_email))
                conn.commit()
            
            # Log azione
            AdminModel.log_admin_action(
                admin_email, "PASSWORD_RESET", user["id"], target_email,
                f"Password reset for user {target_email}", None, True
            )
            
            return True
            
        except Exception as e:
            AdminModel.log_admin_action(
                admin_email, "PASSWORD_RESET", None, target_email,
                f"Password reset failed: {str(e)}", None, False
            )
            return False

# Utilità per validazione password
def validate_password_strength(password: str) -> Dict[str, Any]:
    """Valida forza password"""
    errors = []
    
    if len(password) < 8:
        errors.append("Password must be at least 8 characters long")
    
    if not any(c.isupper() for c in password):
        errors.append("Password must contain at least one uppercase letter")
    
    if not any(c.islower() for c in password):
        errors.append("Password must contain at least one lowercase letter")
    
    if not any(c.isdigit() for c in password):
        errors.append("Password must contain at least one number")
    
    special_chars = "!@#$%^&*()_+-=[]{}|;:,.<>?"
    if not any(c in special_chars for c in password):
        errors.append("Password must contain at least one special character")
    
    return {
        "is_valid": len(errors) == 0,
        "errors": errors,
        "strength": "strong" if len(errors) == 0 else "weak"
    }
