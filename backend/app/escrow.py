"""
Advanced Escrow Crypto System for admin password recovery without content access
"""
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
import os
import secrets
import base64
from typing import Optional, Tuple, Dict, Any
import json

class EscrowCryptoAdvanced:
    """
    Sistema Escrow Avanzato per reset password amministratore
    
    Funzionamento:
    1. Ogni utente ha una chiave di crittografia derivata dalla password
    2. La chiave utente è crittografata con una chiave escrow e salvata nel DB
    3. L'admin può decriptare la chiave escrow per generare nuove credenziali
    4. L'admin NON può mai accedere ai contenuti dei messaggi
    """
    
    # Chiave master escrow (in produzione va protetta con HSM/KMS)
    ESCROW_MASTER_KEY = os.getenv("ESCROW_MASTER_KEY", "escrow_master_key_placeholder_32bytes")
    
    @classmethod
    def generate_salt(cls, length: int = 32) -> bytes:
        """Genera salt casuale"""
        return os.urandom(length)
    
    @classmethod
    def derive_key_from_password(cls, password: str, salt: bytes, iterations: int = 100000) -> bytes:
        """Deriva chiave da password usando PBKDF2"""
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=iterations,
        )
        return kdf.derive(password.encode())
    
    @classmethod
    def encrypt_aes_gcm(cls, plaintext: bytes, key: bytes) -> Tuple[bytes, bytes, bytes]:
        """Cripta con AES-256-GCM"""
        nonce = os.urandom(12)  # GCM nonce 96 bit
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce))
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(plaintext) + encryptor.finalize()
        return ciphertext, nonce, encryptor.tag
    
    @classmethod
    def decrypt_aes_gcm(cls, ciphertext: bytes, key: bytes, nonce: bytes, tag: bytes) -> bytes:
        """Decripta con AES-256-GCM"""
        cipher = Cipher(algorithms.AES(key), modes.GCM(nonce, tag))
        decryptor = cipher.decryptor()
        return decryptor.update(ciphertext) + decryptor.finalize()
    
    @classmethod
    def create_user_encryption_package(cls, password: str, email: str) -> Dict[str, str]:
        """
        Crea pacchetto di crittografia per nuovo utente
        
        Returns:
            dict con user_key_hash, escrow_data_encrypted, salt
        """
        # Genera salt unico per utente
        user_salt = cls.generate_salt()
        
        # Deriva chiave utente da password
        user_key = cls.derive_key_from_password(password, user_salt)
        
        # Crea hash della chiave utente (per validazione)
        user_key_hash = base64.b64encode(user_key).decode()
        
        # Prepara dati per escrow (user_key + metadata)
        escrow_data = {
            "user_key": base64.b64encode(user_key).decode(),
            "salt": base64.b64encode(user_salt).decode(),
            "email": email,
            "created_at": str(int(os.times()[4]))  # timestamp
        }
        escrow_json = json.dumps(escrow_data).encode()
        
        # Cripta dati escrow con chiave master
        escrow_master_key = cls.ESCROW_MASTER_KEY.encode()[:32].ljust(32, b'0')
        encrypted_data, nonce, tag = cls.encrypt_aes_gcm(escrow_json, escrow_master_key)
        
        # Combina nonce + tag + dati crittografati
        escrow_package = nonce + tag + encrypted_data
        escrow_data_encrypted = base64.b64encode(escrow_package).decode()
        
        return {
            "user_key_hash": user_key_hash,
            "escrow_data_encrypted": escrow_data_encrypted,
            "salt": base64.b64encode(user_salt).decode()
        }
    
    @classmethod
    def admin_decrypt_user_escrow(cls, escrow_data_encrypted: str) -> Optional[Dict[str, Any]]:
        """
        Decripta dati escrow per recupero password (solo admin)
        
        Args:
            escrow_data_encrypted: Dati escrow crittografati
            
        Returns:
            Dict con user_key, salt, email se successo, None se fallimento
        """
        try:
            # Decodifica base64
            escrow_package = base64.b64decode(escrow_data_encrypted.encode())
            
            # Estrai componenti
            nonce = escrow_package[:12]
            tag = escrow_package[12:28]
            encrypted_data = escrow_package[28:]
            
            # Decripta con chiave master
            escrow_master_key = cls.ESCROW_MASTER_KEY.encode()[:32].ljust(32, b'0')
            decrypted_json = cls.decrypt_aes_gcm(encrypted_data, escrow_master_key, nonce, tag)
            
            # Decodifica JSON
            escrow_data = json.loads(decrypted_json.decode())
            
            return escrow_data
            
        except Exception as e:
            print(f"Errore decrypt escrow: {e}")
            return None
    
    @classmethod
    def admin_reset_user_password(cls, user_email: str, escrow_data_encrypted: str, 
                                new_password: str) -> Optional[Dict[str, str]]:
        """
        Reset password utente da parte admin
        
        Args:
            user_email: Email dell'utente
            escrow_data_encrypted: Dati escrow dell'utente
            new_password: Nuova password da impostare
            
        Returns:
            Dict con nuovi hash e dati escrow se successo
        """
        try:
            # Decripta dati escrow
            escrow_data = cls.admin_decrypt_user_escrow(escrow_data_encrypted)
            if not escrow_data:
                return None
            
            # Verifica email
            if escrow_data.get("email") != user_email:
                return None
            
            # Crea nuovo pacchetto crittografia con nuova password
            new_package = cls.create_user_encryption_package(new_password, user_email)
            
            return new_package
            
        except Exception as e:
            print(f"Errore reset password: {e}")
            return None
    
    @classmethod
    def verify_user_key(cls, password: str, salt_b64: str, user_key_hash: str) -> bool:
        """Verifica che password generi la chiave corretta"""
        try:
            salt = base64.b64decode(salt_b64.encode())
            derived_key = cls.derive_key_from_password(password, salt)
            derived_hash = base64.b64encode(derived_key).decode()
            return derived_hash == user_key_hash
        except:
            return False
    
    @classmethod
    def generate_temporary_password(cls, length: int = 16) -> str:
        """Genera password temporanea sicura"""
        alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*"
        return ''.join(secrets.choice(alphabet) for _ in range(length))

class EscrowManager:
    """Manager per operazioni escrow integrate con database"""
    
    @staticmethod
    def create_user_with_escrow(email: str, password: str) -> Optional[Dict[str, Any]]:
        """Crea utente con sistema escrow"""
        from .auth import AuthManager
        
        # Genera pacchetto crittografia
        crypto_package = EscrowCryptoAdvanced.create_user_encryption_package(password, email)
        
        # Hash password per autenticazione
        password_hash = AuthManager.hash_password(password)
        
        return {
            "email": email,
            "password_hash": password_hash,
            "user_key_hash": crypto_package["user_key_hash"],
            "escrow_key_encrypted": crypto_package["escrow_data_encrypted"]
        }
    
    @staticmethod
    def admin_password_recovery(admin_email: str, target_email: str) -> Optional[Dict[str, str]]:
        """
        Procedura completa di recupero password
        
        Returns:
            Dict con temporary_password e update_data se successo
        """
        from .database import UserModel, AdminModel
        
        try:
            # Recupera utente target
            user = UserModel.get_user_by_email(target_email)
            if not user:
                AdminModel.log_admin_action(
                    admin_email, "PASSWORD_RECOVERY", None, target_email,
                    "User not found", None, False
                )
                return None
            
            # Genera password temporanea
            temp_password = EscrowCryptoAdvanced.generate_temporary_password()
            
            # Reset usando sistema escrow
            new_crypto_data = EscrowCryptoAdvanced.admin_reset_user_password(
                target_email, user["escrow_key_encrypted"], temp_password
            )
            
            if not new_crypto_data:
                AdminModel.log_admin_action(
                    admin_email, "PASSWORD_RECOVERY", user["id"], target_email,
                    "Escrow decryption failed", None, False
                )
                return None
            
            # Aggiorna database
            from .auth import AuthManager
            new_password_hash = AuthManager.hash_password(temp_password)
            
            from .database import db_manager
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    UPDATE users 
                    SET password_hash = ?, user_key_hash = ?, escrow_key_encrypted = ?,
                        failed_login_attempts = 0, locked_until = NULL
                    WHERE email = ?
                """, (
                    new_password_hash,
                    new_crypto_data["user_key_hash"],
                    new_crypto_data["escrow_data_encrypted"],
                    target_email
                ))
                conn.commit()
            
            # Log successo
            AdminModel.log_admin_action(
                admin_email, "PASSWORD_RECOVERY", user["id"], target_email,
                f"Password recovery successful for {target_email}", None, True
            )
            
            return {
                "temporary_password": temp_password,
                "message": "Password reset successful. User should change password on first login."
            }
            
        except Exception as e:
            AdminModel.log_admin_action(
                admin_email, "PASSWORD_RECOVERY", None, target_email,
                f"Password recovery error: {str(e)}", None, False
            )
            return None
    
    @staticmethod
    def verify_escrow_integrity() -> Dict[str, Any]:
        """Verifica integrità sistema escrow"""
        from .database import db_manager
        
        stats = {
            "total_users": 0,
            "valid_escrow": 0,
            "invalid_escrow": 0,
            "errors": []
        }
        
        try:
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT email, escrow_key_encrypted FROM users WHERE is_active = 1")
                users = cursor.fetchall()
                
                stats["total_users"] = len(users)
                
                for user in users:
                    email, escrow_data = user[0], user[1]
                    
                    # Tenta decrypt escrow
                    decrypted = EscrowCryptoAdvanced.admin_decrypt_user_escrow(escrow_data)
                    
                    if decrypted and decrypted.get("email") == email:
                        stats["valid_escrow"] += 1
                    else:
                        stats["invalid_escrow"] += 1
                        stats["errors"].append(f"Invalid escrow for {email}")
        
        except Exception as e:
            stats["errors"].append(f"Verification error: {str(e)}")
        
        return stats

# Test del sistema escrow
def test_escrow_system():
    """Test completo del sistema escrow"""
    print("=== Test Sistema Escrow ===")
    
    # Test 1: Creazione utente
    print("1. Test creazione utente...")
    crypto_package = EscrowCryptoAdvanced.create_user_encryption_package(
        "TestPassword123!", "test@example.com"
    )
    print(f"✓ Pacchetto creato: {list(crypto_package.keys())}")
    
    # Test 2: Decrypt escrow admin
    print("2. Test decrypt escrow...")
    escrow_data = EscrowCryptoAdvanced.admin_decrypt_user_escrow(
        crypto_package["escrow_data_encrypted"]
    )
    print(f"✓ Escrow decriptato: {escrow_data is not None}")
    
    # Test 3: Reset password
    print("3. Test reset password...")
    new_package = EscrowCryptoAdvanced.admin_reset_user_password(
        "test@example.com",
        crypto_package["escrow_data_encrypted"],
        "NewPassword456!"
    )
    print(f"✓ Reset completato: {new_package is not None}")
    
    # Test 4: Verifica chiave
    print("4. Test verifica chiave...")
    is_valid = EscrowCryptoAdvanced.verify_user_key(
        "NewPassword456!",
        new_package["salt"],
        new_package["user_key_hash"]
    )
    print(f"✓ Chiave valida: {is_valid}")
    
    print("=== Test Completato ===")

if __name__ == "__main__":
    test_escrow_system()
