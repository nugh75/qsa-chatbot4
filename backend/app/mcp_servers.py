"""
Sistema per gestire server MCP (Model Context Protocol)
Permette di configurare e utilizzare server MCP esterni per estendere le funzionalità
"""
from __future__ import annotations

import json
import subprocess
import asyncio
import logging
from pathlib import Path
from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from enum import Enum

logger = logging.getLogger(__name__)

# Directory per configurazioni MCP
MCP_CONFIG_DIR = Path('/app/storage/mcp_servers')
MCP_CONFIG_FILE = MCP_CONFIG_DIR / 'mcp_servers.json'

class MCPServerType(str, Enum):
    EMAIL = "email"
    CALENDAR = "calendar"
    FILE_SYSTEM = "filesystem"
    WEB_SCRAPER = "webscraper"
    DATABASE = "database"
    CUSTOM = "custom"

class MCPServerStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    CONNECTING = "connecting"

class MCPServerConfig(BaseModel):
    id: str
    name: str
    type: MCPServerType
    command: str  # Comando per avviare il server
    args: List[str] = []  # Argomenti aggiuntivi
    env_vars: Dict[str, str] = {}  # Variabili d'ambiente specifiche
    port: Optional[int] = None  # Porta se usa connessione TCP
    auto_start: bool = True  # Avvio automatico
    enabled: bool = True
    description: str = ""
    config: Dict[str, Any] = {}  # Configurazione specifica del server

class MCPServerInstance:
    """Istanza di un server MCP in esecuzione"""
    
    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.status = MCPServerStatus.INACTIVE
        self.last_error: Optional[str] = None
        
    async def start(self) -> bool:
        """Avvia il server MCP"""
        if self.process and self.process.poll() is None:
            return True  # Già in esecuzione
            
        try:
            self.status = MCPServerStatus.CONNECTING
            logger.info(f"Avvio server MCP: {self.config.name}")
            
            # Prepara comando e ambiente
            cmd = [self.config.command] + self.config.args
            env = {**self.config.env_vars}
            
            # Avvia processo
            self.process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True
            )
            
            # Attende un po' per verificare che si avvii correttamente
            await asyncio.sleep(1)
            
            if self.process.poll() is None:
                self.status = MCPServerStatus.ACTIVE
                logger.info(f"Server MCP {self.config.name} avviato con successo")
                return True
            else:
                error = self.process.stderr.read() if self.process.stderr else "Processo terminato"
                self.last_error = error
                self.status = MCPServerStatus.ERROR
                logger.error(f"Errore avvio server MCP {self.config.name}: {error}")
                return False
                
        except Exception as e:
            self.last_error = str(e)
            self.status = MCPServerStatus.ERROR
            logger.error(f"Errore avvio server MCP {self.config.name}: {e}")
            return False
    
    async def stop(self) -> bool:
        """Ferma il server MCP"""
        if not self.process:
            return True
            
        try:
            logger.info(f"Arresto server MCP: {self.config.name}")
            self.process.terminate()
            
            # Attende terminazione graceful
            try:
                await asyncio.wait_for(
                    asyncio.create_task(self._wait_process_end()), 
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.warning(f"Timeout terminazione server {self.config.name}, forzo kill")
                self.process.kill()
                
            self.status = MCPServerStatus.INACTIVE
            self.process = None
            return True
            
        except Exception as e:
            logger.error(f"Errore arresto server MCP {self.config.name}: {e}")
            return False
    
    async def _wait_process_end(self):
        """Attende la fine del processo"""
        while self.process and self.process.poll() is None:
            await asyncio.sleep(0.1)
    
    def is_running(self) -> bool:
        """Verifica se il server è in esecuzione"""
        return self.process is not None and self.process.poll() is None
    
    def get_status(self) -> Dict[str, Any]:
        """Ottiene lo stato del server"""
        return {
            "id": self.config.id,
            "name": self.config.name,
            "type": self.config.type,
            "status": self.status,
            "enabled": self.config.enabled,
            "auto_start": self.config.auto_start,
            "pid": self.process.pid if self.process else None,
            "last_error": self.last_error
        }

class MCPServerManager:
    """Gestore centrale per tutti i server MCP"""
    
    def __init__(self):
        self.servers: Dict[str, MCPServerInstance] = {}
        self._ensure_config_dir()
        
    def _ensure_config_dir(self):
        """Assicura che la directory di configurazione esista"""
        MCP_CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        
    def load_configurations(self) -> List[MCPServerConfig]:
        """Carica le configurazioni dei server MCP"""
        try:
            if MCP_CONFIG_FILE.exists():
                data = json.loads(MCP_CONFIG_FILE.read_text(encoding='utf-8'))
                return [MCPServerConfig(**config) for config in data.get('servers', [])]
        except Exception as e:
            logger.error(f"Errore caricamento configurazioni MCP: {e}")
        
        return []
    
    def save_configurations(self, configs: List[MCPServerConfig]):
        """Salva le configurazioni dei server MCP"""
        try:
            data = {
                'servers': [config.dict() for config in configs]
            }
            MCP_CONFIG_FILE.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding='utf-8'
            )
        except Exception as e:
            logger.error(f"Errore salvataggio configurazioni MCP: {e}")
            raise
    
    async def start_server(self, server_id: str) -> bool:
        """Avvia un server specifico"""
        if server_id not in self.servers:
            configs = self.load_configurations()
            config = next((c for c in configs if c.id == server_id), None)
            if not config:
                logger.error(f"Configurazione server MCP {server_id} non trovata")
                return False
            self.servers[server_id] = MCPServerInstance(config)
        
        return await self.servers[server_id].start()
    
    async def stop_server(self, server_id: str) -> bool:
        """Ferma un server specifico"""
        if server_id in self.servers:
            return await self.servers[server_id].stop()
        return True
    
    async def restart_server(self, server_id: str) -> bool:
        """Riavvia un server"""
        await self.stop_server(server_id)
        return await self.start_server(server_id)
    
    async def start_all_auto_servers(self):
        """Avvia tutti i server con auto_start=True"""
        configs = self.load_configurations()
        for config in configs:
            if config.enabled and config.auto_start:
                await self.start_server(config.id)
    
    async def stop_all_servers(self):
        """Ferma tutti i server"""
        for server_id in list(self.servers.keys()):
            await self.stop_server(server_id)
    
    def get_server_status(self, server_id: str) -> Optional[Dict[str, Any]]:
        """Ottiene lo stato di un server"""
        if server_id in self.servers:
            return self.servers[server_id].get_status()
        return None
    
    def get_all_servers_status(self) -> List[Dict[str, Any]]:
        """Ottiene lo stato di tutti i server"""
        configs = self.load_configurations()
        statuses = []
        
        for config in configs:
            if config.id in self.servers:
                status = self.servers[config.id].get_status()
            else:
                status = {
                    "id": config.id,
                    "name": config.name,
                    "type": config.type,
                    "status": MCPServerStatus.INACTIVE,
                    "enabled": config.enabled,
                    "auto_start": config.auto_start,
                    "pid": None,
                    "last_error": None
                }
            statuses.append(status)
        
        return statuses
    
    def add_server_config(self, config: MCPServerConfig):
        """Aggiunge una nuova configurazione server"""
        configs = self.load_configurations()
        
        # Rimuove configurazione esistente se presente
        configs = [c for c in configs if c.id != config.id]
        configs.append(config)
        
        self.save_configurations(configs)
    
    def remove_server_config(self, server_id: str):
        """Rimuove una configurazione server"""
        configs = self.load_configurations()
        configs = [c for c in configs if c.id != server_id]
        self.save_configurations(configs)
        
        # Ferma il server se in esecuzione
        if server_id in self.servers:
            asyncio.create_task(self.stop_server(server_id))

# Istanza globale del manager
mcp_manager = MCPServerManager()

# Configurazioni predefinite per server comuni
EMAIL_MCP_CONFIG = MCPServerConfig(
    id="email_server",
    name="Email Server",
    type=MCPServerType.EMAIL,
    command="npx",
    args=["@modelcontextprotocol/server-email"],
    description="Server MCP per inviare e gestire email",
    config={
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "use_tls": True
    }
)

def get_default_configs() -> List[MCPServerConfig]:
    """Ottiene le configurazioni predefinite"""
    return [EMAIL_MCP_CONFIG]
