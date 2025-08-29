"""
RAG Engine - Sistema di Retrieval-Augmented Generation
Gestisce embeddings, chunking, storage vettoriale e retrieval
"""
from typing import List, Dict, Any, Optional, Tuple
import os
import json
import numpy as np
from pathlib import Path
import sqlite3
from datetime import datetime
import hashlib
import logging

# Import per embedding e text processing
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import faiss
import pickle

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RAGEngine:
    """
    Engine principale per il sistema RAG
    Gestisce embedding, chunking, storage e retrieval
    """
    
    def __init__(self, model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"):
        """Inizializza il RAG Engine.

        Args:
            model_name: Nome del modello SentenceTransformer per gli embedding (fallback legacy)
        """
        self.model_name = model_name
        # embedding gestito da embedding_manager (fallback legacy se manager non disponibile)
        self.embedding_model = None
        self.dimension = 384  # aggiornato dal provider quando disponibile
        
        # Percorsi file
        self.base_dir = Path(__file__).parent.parent
        self.data_dir = self.base_dir / "storage" / "rag_data"
        self.embeddings_dir = self.data_dir / "embeddings"
        self.db_path = self.base_dir / "storage" / "databases" / "rag.db"
        
        # Crea directory se non esistono
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.embeddings_dir.mkdir(parents=True, exist_ok=True)
        # Assicurati che esista anche la directory per il database
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Text splitter per chunking
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", ". ", "! ", "? ", ", ", " ", ""]
        )
        
        # FAISS indexes per gruppo
        self.group_indexes = {}
        
        # Inizializza database
        self._init_database()
        
    def _init_database(self):
        """Inizializza il database SQLite per metadati"""
        conn = sqlite3.connect(str(self.db_path))
        cursor = conn.cursor()
        
        # Tabella gruppi
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rag_groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Tabella documenti
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rag_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id INTEGER,
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                file_hash TEXT UNIQUE NOT NULL,
                file_size INTEGER,
                content_preview TEXT,
                chunk_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES rag_groups (id) ON DELETE CASCADE
            )
        """)
        
        # Tabella chunks
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS rag_chunks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER,
                group_id INTEGER,
                chunk_index INTEGER,
                content TEXT NOT NULL,
                embedding_vector BLOB,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (document_id) REFERENCES rag_documents (id) ON DELETE CASCADE,
                FOREIGN KEY (group_id) REFERENCES rag_groups (id) ON DELETE CASCADE
            )
        """)
        
        # Indici per performance
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_group ON rag_chunks (group_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_chunks_document ON rag_chunks (document_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_documents_group ON rag_documents (group_id)")
        
        conn.commit()
        conn.close()
        
    def _ensure_provider(self):
        """Recupera provider embedding da embedding_manager se possibile, altrimenti fallback legacy."""
        if self.embedding_model is not None:
            return
        try:
            from . import embedding_manager  # import lazy
            provider = embedding_manager.get_provider()
            info = provider.info()
            self.embedding_model = provider
            if info.get('dimension'):
                self.dimension = info['dimension']
            self.model_name = info.get('model_name', self.model_name)
            logger.info(f"Embedding provider attivo: {info.get('provider_type')} {self.model_name} dim={self.dimension}")
        except Exception as e:  # fallback
            logger.warning(f"Embedding manager non disponibile, uso fallback legacy: {e}")
            try:
                self.embedding_model = SentenceTransformer(self.model_name)
                self.dimension = self.embedding_model.get_sentence_embedding_dimension()
            except Exception as le:
                raise RuntimeError(f"Impossibile inizializzare embedding: {le}")
    
    def create_group(self, name: str, description: str = "") -> int:
        """
        Crea un nuovo gruppo
        
        Args:
            name: Nome del gruppo
            description: Descrizione del gruppo
            
        Returns:
            ID del gruppo creato
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute(
                "INSERT INTO rag_groups (name, description) VALUES (?, ?)",
                (name, description)
            )
            group_id = cursor.lastrowid
            conn.commit()
            logger.info(f"Gruppo creato: {name} (ID: {group_id})")
            return group_id
        except sqlite3.IntegrityError:
            raise ValueError(f"Gruppo '{name}' già esistente")
        finally:
            conn.close()
    
    def get_groups(self) -> List[Dict[str, Any]]:
        """Restituisce lista di tutti i gruppi"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
                   COUNT(d.id) as document_count,
                   COUNT(c.id) as chunk_count
            FROM rag_groups g
            LEFT JOIN rag_documents d ON g.id = d.group_id
            LEFT JOIN rag_chunks c ON g.id = c.group_id
            GROUP BY g.id, g.name, g.description, g.created_at, g.updated_at
            ORDER BY g.name
        """)
        
        groups = []
        for row in cursor.fetchall():
            groups.append({
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "created_at": row[3],
                "updated_at": row[4],
                "document_count": row[5],
                "chunk_count": row[6]
            })
        
        conn.close()
        return groups
    
    def delete_group(self, group_id: int):
        """Elimina un gruppo e tutti i suoi documenti"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Rimuovi anche l'indice FAISS se esiste
        if str(group_id) in self.group_indexes:
            del self.group_indexes[str(group_id)]
        
        # Rimuovi file indice
        index_file = self.embeddings_dir / f"group_{group_id}.faiss"
        if index_file.exists():
            index_file.unlink()
        
        cursor.execute("DELETE FROM rag_groups WHERE id = ?", (group_id,))
        conn.commit()
        conn.close()
        
        logger.info(f"Gruppo {group_id} eliminato")
    
    def update_group(self, group_id: int, name: str = None, description: str = None):
        """Aggiorna nome e/o descrizione di un gruppo"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        
        if description is not None:
            updates.append("description = ?")
            params.append(description)
        
        if updates:
            query = f"UPDATE rag_groups SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
            params.append(group_id)
            cursor.execute(query, params)
            conn.commit()
        
        conn.close()
        logger.info(f"Gruppo {group_id} aggiornato")
    
    def add_document(self, group_id: int, filename: str, content: str, original_filename: str = None) -> int:
        """
        Aggiunge un documento a un gruppo
        
        Args:
            group_id: ID del gruppo
            filename: Nome del file
            content: Contenuto del documento
            original_filename: Nome originale del file
            
        Returns:
            ID del documento creato
        """
        if original_filename is None:
            original_filename = filename
            
        # Calcola hash del contenuto
        file_hash = hashlib.sha256(content.encode()).hexdigest()
        
        # Crea preview del contenuto
        content_preview = content[:500] + "..." if len(content) > 500 else content
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO rag_documents 
                (group_id, filename, original_filename, file_hash, file_size, content_preview)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (group_id, filename, original_filename, file_hash, len(content), content_preview))
            
            document_id = cursor.lastrowid
            conn.commit()
            
            # Processa il documento in chunks ed embedding
            chunk_count = self._process_document(document_id, group_id, content)
            
            # Aggiorna contatore chunks
            cursor.execute(
                "UPDATE rag_documents SET chunk_count = ? WHERE id = ?",
                (chunk_count, document_id)
            )
            conn.commit()
            
            logger.info(f"Documento aggiunto: {filename} (ID: {document_id}, Chunks: {chunk_count})")
            return document_id
            
        except sqlite3.IntegrityError:
            raise ValueError(f"Documento con hash '{file_hash}' già esistente")
        finally:
            conn.close()
    
    def _process_document(self, document_id: int, group_id: int, content: str) -> int:
        """Processa un documento: chunking + embedding e memorizzazione.

        Returns:
            Numero di chunks creati
        """
        # Assicura provider
        self._ensure_provider()

        # Chunking
        chunks = self.text_splitter.split_text(content)
        if not chunks:
            return 0

        # Embedding
        if hasattr(self.embedding_model, 'embed'):
            embeddings = self.embedding_model.embed(chunks)
        else:  # legacy SentenceTransformer
            embeddings = self.embedding_model.encode(chunks)

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            metadata = {
                "chunk_index": i,
                "chunk_length": len(chunk_text),
                "document_id": document_id,
                "group_id": group_id
            }
            cursor.execute(
                """INSERT INTO rag_chunks (document_id, group_id, chunk_index, content, embedding_vector, metadata)
                    VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    document_id,
                    group_id,
                    i,
                    chunk_text,
                    pickle.dumps(embedding),
                    json.dumps(metadata)
                )
            )
        conn.commit()
        conn.close()

        # Ricostruisce indice del gruppo
        self._rebuild_group_index(group_id)
        return len(chunks)
    
    def _rebuild_group_index(self, group_id: int):
        """Ricostruisce l'indice FAISS per un gruppo"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Recupera tutti gli embeddings del gruppo
        cursor.execute(
            "SELECT id, embedding_vector FROM rag_chunks WHERE group_id = ? ORDER BY id",
            (group_id,)
        )
        
        rows = cursor.fetchall()
        conn.close()
        
        if not rows:
            return
        
        # Crea nuovo indice FAISS
        index = faiss.IndexFlatIP(self.dimension)  # Inner Product per similarity
        
        # Aggiungi tutti gli embeddings
        embeddings = []
        chunk_ids = []
        
        for chunk_id, embedding_blob in rows:
            embedding = pickle.loads(embedding_blob)
            embeddings.append(embedding)
            chunk_ids.append(chunk_id)
        
        # Normalizza embeddings per cosine similarity
        embeddings = np.array(embeddings).astype('float32')
        faiss.normalize_L2(embeddings)
        
        index.add(embeddings)
        
        # Salva indice e mapping
        self.group_indexes[str(group_id)] = {
            "index": index,
            "chunk_ids": chunk_ids
        }
        
        # Salva su disco
        index_file = self.embeddings_dir / f"group_{group_id}.faiss"
        faiss.write_index(index, str(index_file))
        
        # Salva mapping chunk_ids
        mapping_file = self.embeddings_dir / f"group_{group_id}_mapping.json"
        with open(mapping_file, 'w') as f:
            json.dump(chunk_ids, f)
        
        logger.info(f"Indice FAISS ricostruito per gruppo {group_id}: {len(chunk_ids)} chunks")
    
    def _load_group_index(self, group_id: int) -> bool:
        """Carica l'indice FAISS per un gruppo"""
        if str(group_id) in self.group_indexes:
            return True
        
        index_file = self.embeddings_dir / f"group_{group_id}.faiss"
        mapping_file = self.embeddings_dir / f"group_{group_id}_mapping.json"
        
        if not (index_file.exists() and mapping_file.exists()):
            return False
        
        try:
            index = faiss.read_index(str(index_file))
            with open(mapping_file, 'r') as f:
                chunk_ids = json.load(f)
            
            self.group_indexes[str(group_id)] = {
                "index": index,
                "chunk_ids": chunk_ids
            }
            return True
        except Exception as e:
            logger.error(f"Errore caricamento indice gruppo {group_id}: {e}")
            return False
    
    def search(self, query: str, group_ids: List[int], top_k: int = 5) -> List[Dict[str, Any]]:
        """Esegue ricerca semantica sui gruppi indicati."""
        if not group_ids:
            return []

        self._ensure_provider()

        # Query embedding
        if hasattr(self.embedding_model, 'embed'):
            query_embedding = self.embedding_model.embed([query])[0]
        else:
            query_embedding = self.embedding_model.encode([query])[0]
        query_embedding = query_embedding.astype('float32').reshape(1, -1)
        faiss.normalize_L2(query_embedding)

        all_results: List[Dict[str, Any]] = []
        for group_id in group_ids:
            if not self._load_group_index(group_id):
                continue
            group_data = self.group_indexes[str(group_id)]
            index = group_data["index"]
            chunk_ids = group_data["chunk_ids"]
            if index.ntotal == 0:
                continue
            scores, indices = index.search(query_embedding, min(top_k, index.ntotal))
            chunk_details = self._get_chunk_details([chunk_ids[i] for i in indices[0]])
            for score, chunk_detail in zip(scores[0], chunk_details):
                chunk_detail["similarity_score"] = float(score)
                chunk_detail["group_id"] = group_id
                all_results.append(chunk_detail)

        all_results.sort(key=lambda x: x["similarity_score"], reverse=True)
        return all_results[: top_k * len(group_ids)]
    
    def _get_chunk_details(self, chunk_ids: List[int]) -> List[Dict[str, Any]]:
        """Recupera i dettagli dei chunks dal database"""
        if not chunk_ids:
            return []
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        placeholders = ",".join("?" for _ in chunk_ids)
        cursor.execute(f"""
            SELECT c.id, c.content, c.chunk_index, c.metadata,
                   d.id as document_id, d.filename, d.original_filename
            FROM rag_chunks c
            JOIN rag_documents d ON c.document_id = d.id
            WHERE c.id IN ({placeholders})
        """, chunk_ids)
        
        results = []
        for row in cursor.fetchall():
            metadata = json.loads(row[3]) if row[3] else {}
            results.append({
                "chunk_id": row[0],
                "content": row[1],
                "chunk_index": row[2],
                "metadata": metadata,
                "document_id": row[4],
                "filename": row[5],
                "original_filename": row[6]
            })
        
        conn.close()
        return results
    
    def get_group_documents(self, group_id: int) -> List[Dict[str, Any]]:
        """Recupera tutti i documenti di un gruppo"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, filename, original_filename, file_size, content_preview, 
                   chunk_count, created_at
            FROM rag_documents 
            WHERE group_id = ?
            ORDER BY created_at DESC
        """, (group_id,))
        
        documents = []
        for row in cursor.fetchall():
            documents.append({
                "id": row[0],
                "filename": row[1],
                "original_filename": row[2],
                "file_size": row[3],
                "content_preview": row[4],
                "chunk_count": row[5],
                "created_at": row[6]
            })
        
        conn.close()
        return documents
    
    def delete_document(self, document_id: int):
        """Elimina un documento e tutti i suoi chunks"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Recupera group_id prima di eliminare
        cursor.execute("SELECT group_id FROM rag_documents WHERE id = ?", (document_id,))
        result = cursor.fetchone()
        
        if result:
            group_id = result[0]
            cursor.execute("DELETE FROM rag_documents WHERE id = ?", (document_id,))
            conn.commit()
            
            # Ricostruisci indice del gruppo
            self._rebuild_group_index(group_id)
            
            logger.info(f"Documento {document_id} eliminato")
        
        conn.close()
    
    def get_stats(self) -> Dict[str, Any]:
        """Restituisce statistiche del sistema RAG"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM rag_groups")
        total_groups = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM rag_documents")
        total_documents = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM rag_chunks")
        total_chunks = cursor.fetchone()[0]
        
        cursor.execute("SELECT SUM(file_size) FROM rag_documents")
        total_size = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            "total_groups": total_groups,
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "total_size_bytes": total_size,
            "embedding_model": self.model_name,
            "embedding_dimension": self.dimension
        }

# Istanza globale
rag_engine = RAGEngine()
