"""
MCP (Model Context Protocol) Server Manager
Gestisce la configurazione e l'integrazione con MCP servers
"""
import json
import subprocess
import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# Path per la configurazione MCP
MCP_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "mcp_config.json"

class MCPServerConfig(BaseModel):
    id: str
    name: str
    description: str
    command: str
    args: List[str] = []
    env: Dict[str, str] = {}
    enabled: bool = True
    capabilities: List[str] = []  # es. ["email", "files", "tools"]
    
class MCPManager:
    """Gestisce i server MCP configurati"""
    
    def __init__(self):
        self.servers: Dict[str, MCPServerConfig] = {}
        self.active_connections: Dict[str, Any] = {}
        self.load_config()
    
    def load_config(self):
        """Carica la configurazione MCP dal file"""
        try:
            if MCP_CONFIG_PATH.exists():
                data = json.loads(MCP_CONFIG_PATH.read_text(encoding="utf-8"))
                for server_data in data.get("servers", []):
                    server = MCPServerConfig(**server_data)
                    self.servers[server.id] = server
                logger.info(f"Caricati {len(self.servers)} server MCP")
            else:
                # Crea configurazione di esempio
                self._create_default_config()
        except Exception as e:
            logger.error(f"Errore caricamento config MCP: {e}")
            
    def _create_default_config(self):
        """Crea una configurazione di esempio"""
        default_config = {
            "servers": [
                {
                    "id": "email_server",
                    "name": "Email MCP Server",
                    "description": "Server per inviare email tramite MCP",
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-email"],
                    "env": {
                        "SMTP_HOST": "",
                        "SMTP_PORT": "587",
                        "SMTP_USER": "",
                        "SMTP_PASSWORD": "",
                        "SMTP_FROM": ""
                    },
                    "enabled": False,
                    "capabilities": ["email", "send_message"]
                },
                {
                    "id": "filesystem_server",
                    "name": "Filesystem MCP Server", 
                    "description": "Server per operazioni su file",
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-filesystem", "/tmp"],
                    "env": {},
                    "enabled": False,
                    "capabilities": ["files", "read_file", "write_file", "list_directory"]
                }
            ]
        }
        
        MCP_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        MCP_CONFIG_PATH.write_text(json.dumps(default_config, indent=2), encoding="utf-8")
        self.load_config()
    
    def save_config(self):
        """Salva la configurazione corrente"""
        config = {
            "servers": [server.dict() for server in self.servers.values()]
        }
        MCP_CONFIG_PATH.write_text(json.dumps(config, indent=2), encoding="utf-8")
    
    def get_servers(self) -> List[Dict[str, Any]]:
        """Ottiene la lista di tutti i server MCP"""
        return [server.dict() for server in self.servers.values()]
    
    def get_enabled_servers(self) -> List[MCPServerConfig]:
        """Ottiene solo i server abilitati"""
        return [server for server in self.servers.values() if server.enabled]
    
    def add_server(self, server_config: MCPServerConfig) -> bool:
        """Aggiunge un nuovo server MCP"""
        try:
            self.servers[server_config.id] = server_config
            self.save_config()
            logger.info(f"Aggiunto server MCP: {server_config.name}")
            return True
        except Exception as e:
            logger.error(f"Errore aggiunta server MCP: {e}")
            return False
    
    def update_server(self, server_id: str, server_config: MCPServerConfig) -> bool:
        """Aggiorna un server MCP esistente"""
        try:
            if server_id in self.servers:
                self.servers[server_id] = server_config
                self.save_config()
                logger.info(f"Aggiornato server MCP: {server_config.name}")
                return True
            return False
        except Exception as e:
            logger.error(f"Errore aggiornamento server MCP: {e}")
            return False
    
    def delete_server(self, server_id: str) -> bool:
        """Elimina un server MCP"""
        try:
            if server_id in self.servers:
                del self.servers[server_id]
                self.save_config()
                # Disconnetti se attivo
                if server_id in self.active_connections:
                    self.disconnect_server(server_id)
                logger.info(f"Eliminato server MCP: {server_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Errore eliminazione server MCP: {e}")
            return False
    
    async def test_server_connection(self, server_id: str) -> Dict[str, Any]:
        """Testa la connessione a un server MCP"""
        if server_id not in self.servers:
            return {"success": False, "error": "Server non trovato"}
        
        server = self.servers[server_id]
        try:
            # Prova a avviare il processo MCP
            process = await asyncio.create_subprocess_exec(
                server.command,
                *server.args,
                env={**server.env},
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Aspetta un po' per vedere se si avvia correttamente
            try:
                await asyncio.wait_for(process.wait(), timeout=5.0)
                stdout, stderr = await process.communicate()
                if process.returncode == 0:
                    return {"success": True, "message": "Server avviato correttamente"}
                else:
                    return {"success": False, "error": f"Exit code: {process.returncode}, stderr: {stderr.decode()}"}
            except asyncio.TimeoutError:
                # Se è ancora in esecuzione dopo 5 secondi, probabilmente è ok
                process.terminate()
                return {"success": True, "message": "Server sembra funzionante"}
                
        except Exception as e:
            return {"success": False, "error": str(e)}
    
    def connect_server(self, server_id: str):
        """Connette a un server MCP (placeholder per implementazione futura)"""
        # Implementazione della connessione MCP
        pass
    
    def disconnect_server(self, server_id: str):
        """Disconnette da un server MCP"""
        if server_id in self.active_connections:
            del self.active_connections[server_id]
    
    def get_server_capabilities(self, server_id: str) -> List[str]:
        """Ottiene le capabilities di un server"""
        if server_id in self.servers:
            return self.servers[server_id].capabilities
        return []

# Istanza globale del manager
mcp_manager = MCPManager()
