#!/usr/bin/env python3
"""
Script di test per verificare il salvataggio delle chat nel database
"""
import asyncio
import requests
import json
import sqlite3

BACKEND_URL = "http://localhost:8005"

def check_database():
    """Verifica il contenuto del database"""
    print("=== STATO DATABASE ===")
    conn = sqlite3.connect('backend/qsa_chatbot.db')
    cursor = conn.cursor()
    
    # Conta utenti
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"Utenti: {user_count}")
    
    # Conta conversazioni
    cursor.execute("SELECT COUNT(*) FROM conversations")
    conv_count = cursor.fetchone()[0]
    print(f"Conversazioni: {conv_count}")
    
    # Conta messaggi
    cursor.execute("SELECT COUNT(*) FROM messages")
    msg_count = cursor.fetchone()[0]
    print(f"Messaggi: {msg_count}")
    
    # Mostra ultime conversazioni
    if conv_count > 0:
        print("\n=== ULTIME CONVERSAZIONI ===")
        cursor.execute("""
            SELECT id, user_id, title_encrypted, created_at, message_count 
            FROM conversations 
            ORDER BY created_at DESC 
            LIMIT 5
        """)
        for row in cursor.fetchall():
            print(f"ID: {row[0]}, User: {row[1]}, Titolo: {row[2][:50]}..., Messaggi: {row[4]}")
    
    # Mostra ultimi messaggi
    if msg_count > 0:
        print("\n=== ULTIMI MESSAGGI ===")
        cursor.execute("""
            SELECT id, conversation_id, role, content_encrypted, timestamp 
            FROM messages 
            ORDER BY timestamp DESC 
            LIMIT 5
        """)
        for row in cursor.fetchall():
            print(f"ID: {row[0]}, Conv: {row[1]}, Role: {row[2]}, Content: {row[3][:30]}...")
    
    conn.close()

def test_anonymous_chat():
    """Test chat anonima (senza autenticazione)"""
    print("\n=== TEST CHAT ANONIMA ===")
    
    response = requests.post(f"{BACKEND_URL}/api/chat", 
                           json={"message": "Ciao, questo è un test anonimo", "sessionId": "test_anonymous"})
    
    if response.status_code == 200:
        data = response.json()
        print(f"✅ Chat anonima funziona: {data['reply'][:50]}...")
        return True
    else:
        print(f"❌ Chat anonima fallita: {response.status_code} - {response.text}")
        return False

def test_authenticated_chat():
    """Test chat autenticata (con salvataggio database)"""
    print("\n=== TEST CHAT AUTENTICATA ===")
    
    # Prima registriamo/loginiamo un utente test
    login_data = {
        "email": "test@example.com",
        "password": "TestPassword123!"
    }
    
    # Prova prima il login
    print("Tentativo login...")
    login_response = requests.post(f"{BACKEND_URL}/api/auth/login", json=login_data)
    
    if login_response.status_code != 200:
        # Se login fallisce, prova registrazione
        print("Login fallito, provo registrazione...")
        register_response = requests.post(f"{BACKEND_URL}/api/auth/register", json=login_data)
        
        if register_response.status_code == 200:
            print("✅ Registrazione riuscita")
            token_data = register_response.json()
        else:
            print(f"❌ Registrazione fallita: {register_response.status_code} - {register_response.text}")
            return False
    else:
        print("✅ Login riuscito")
        token_data = login_response.json()
    
    access_token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {access_token}"}
    
    # Test creazione conversazione
    print("Creazione conversazione...")
    conv_response = requests.post(f"{BACKEND_URL}/api/conversations", 
                                 json={"title_encrypted": "Test Conversation"},
                                 headers=headers)
    
    if conv_response.status_code != 200:
        print(f"❌ Creazione conversazione fallita: {conv_response.status_code} - {conv_response.text}")
        return False
    
    conversation_id = conv_response.json()["conversation_id"]
    print(f"✅ Conversazione creata: {conversation_id}")
    
    # Test chat con conversation_id
    print("Invio messaggio autenticato...")
    chat_response = requests.post(f"{BACKEND_URL}/api/chat",
                                 json={
                                     "message": "Ciao, questo è un test autenticato",
                                     "sessionId": "test_auth",
                                     "conversation_id": conversation_id
                                 },
                                 headers=headers)
    
    if chat_response.status_code == 200:
        data = chat_response.json()
        print(f"✅ Chat autenticata funziona: {data['reply'][:50]}...")
        return True
    else:
        print(f"❌ Chat autenticata fallita: {chat_response.status_code} - {chat_response.text}")
        return False

def main():
    print("🧪 TEST SISTEMA SALVATAGGIO CHAT")
    print("=================================")
    
    # Stato iniziale database
    check_database()
    
    # Test chat anonima
    anonymous_ok = test_anonymous_chat()
    
    # Test chat autenticata
    authenticated_ok = test_authenticated_chat()
    
    # Stato finale database
    print("\n=== STATO FINALE DATABASE ===")
    check_database()
    
    # Riepilogo
    print(f"\n=== RIEPILOGO TEST ===")
    print(f"Chat Anonima: {'✅' if anonymous_ok else '❌'}")
    print(f"Chat Autenticata: {'✅' if authenticated_ok else '❌'}")
    
    if anonymous_ok and authenticated_ok:
        print("🎉 Tutti i test sono passati!")
        return True
    else:
        print("⚠️  Alcuni test sono falliti")
        return False

if __name__ == "__main__":
    main()
