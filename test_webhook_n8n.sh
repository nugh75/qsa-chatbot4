#!/bin/bash
# Script per testare il webhook n8n del counselorbot

WEBHOOK_URL="https://n8n.ai4educ.org/webhook/6f168b25-ed90-42b0-879f-9c182a3081fb"

echo "=== Test Webhook N8N - CounselorBot ==="
echo "URL: $WEBHOOK_URL"
echo "Timestamp: $(date)"
echo ""

# Test 1: Verifica base (GET)
echo "--- Test 1: Verifica raggiungibilità (GET) ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$WEBHOOK_URL"
echo ""

# Test 2: POST con payload minimo
echo "--- Test 2: POST con payload minimo ---"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"message": "Ciao, test rapido"}' \
  --max-time 30 \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

# Test 3: POST con payload completo (come lo invia il chatbot)
echo "--- Test 3: POST con payload completo ---"
curl -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Ho compilato il questionario QSA e vorrei capire i miei risultati",
    "session_id": "test-session-'$(date +%s)'",
    "conversation_id": "conv-test-001",
    "personality_id": "counselorbot-webhook",
    "personality_name": "CounselorBot (webhook)",
    "user_id": "test-user-123",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "stream": false,
    "history": [
      {"role": "user", "content": "Ciao"},
      {"role": "assistant", "content": "Ciao! Come posso aiutarti?"}
    ]
  }' \
  --max-time 60 \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "=== Test completato ==="
