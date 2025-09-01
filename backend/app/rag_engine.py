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
    
    def add_document(self, group_id: int, filename: str, content: str, original_filename: str = None,
                     original_file_bytes: Optional[bytes] = None) -> Tuple[int, Dict[str, Any]]:
        """Aggiunge un documento e (opzionalmente) salva il file originale su disco.

        Ritorna (document_id, metrics)
        """
        if original_filename is None:
            original_filename = filename

        start_time = datetime.utcnow()
        file_hash = hashlib.sha256(content.encode()).hexdigest()
        content_preview = content[:500] + "..." if len(content) > 500 else content

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            # Usa un filename interno provvisorio; verrà aggiornato dopo il salvataggio
            internal_name = filename
            cursor.execute(
                """INSERT INTO rag_documents 
                (group_id, filename, original_filename, file_hash, file_size, content_preview)
                VALUES (?, ?, ?, ?, ?, ?)""",
                (group_id, internal_name, original_filename, file_hash, len(content), content_preview)
            )
            document_id = cursor.lastrowid
            conn.commit()

            # Salva file originale se fornito
            if original_file_bytes:
                files_dir = self.data_dir / "files"
                files_dir.mkdir(parents=True, exist_ok=True)
                safe_name = f"{document_id}_{original_filename}"
                file_path = files_dir / safe_name
                with open(file_path, 'wb') as f:
                    f.write(original_file_bytes)
                # Aggiorna filename interno con il nome sicuro (per referenziare file salvato)
                cursor.execute("UPDATE rag_documents SET filename = ? WHERE id = ?", (safe_name, document_id))
                conn.commit()

            # Processa chunking + embedding
            chunk_start = datetime.utcnow()
            chunk_count = self._process_document(document_id, group_id, content)
            chunk_end = datetime.utcnow()

            cursor.execute("UPDATE rag_documents SET chunk_count = ? WHERE id = ?", (chunk_count, document_id))
            conn.commit()
            end_time = datetime.utcnow()

            metrics = {
                "chunk_count": chunk_count,
                "timings": {
                    "total_ms": int((end_time - start_time).total_seconds() * 1000),
                    "chunking_ms": int((chunk_end - chunk_start).total_seconds() * 1000)
                }
            }
            logger.info(f"Documento aggiunto: {original_filename} (ID: {document_id}, Chunks: {chunk_count})")
            return document_id, metrics
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
        """Restituisce statistiche estese del sistema RAG"""
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

        # Average chunk size (approx) & distribution
        avg_chunk_size = 0
        chunk_distribution = []
        if total_chunks:
            cursor.execute("SELECT AVG(LENGTH(content)) FROM rag_chunks")
            avg_chunk_size = int(cursor.fetchone()[0] or 0)
            # distribution of chunks per document
            cursor.execute("SELECT chunk_count, COUNT(*) FROM rag_documents GROUP BY chunk_count LIMIT 100")
            for row in cursor.fetchall():
                chunk_distribution.append({"chunks_per_doc": row[0], "document_count": row[1]})

        # group breakdown
        cursor.execute("""
            SELECT g.name, COUNT(DISTINCT d.id) as docs, COUNT(c.id) as chunks
            FROM rag_groups g
            LEFT JOIN rag_documents d ON g.id = d.group_id
            LEFT JOIN rag_chunks c ON g.id = c.group_id
            GROUP BY g.id
        """)
        group_breakdown = []
        for row in cursor.fetchall():
            group_breakdown.append({"group_name": row[0], "documents": row[1], "chunks": row[2]})

        conn.close()

        storage_eff = {
            "avg_chunks_per_document": round(total_chunks / total_documents, 2) if total_documents else 0,
            "avg_document_size": int(total_size / total_documents) if total_documents else 0,
            "storage_per_chunk": int(total_size / total_chunks) if total_chunks else 0
        }

        return {
            "total_groups": total_groups,
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "total_size_bytes": total_size,
            "embedding_model": self.model_name,
            "embedding_dimension": self.dimension,
            "average_chunk_size": avg_chunk_size,
            "group_breakdown": group_breakdown,
            "chunk_distribution": chunk_distribution,
            "storage_efficiency": storage_eff
        }

    # ===== Chunk CRUD & Search =====
    def get_all_chunks(self, group_id: int, limit: int = 50, offset: int = 0) -> Dict[str, Any]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM rag_chunks WHERE group_id = ?", (group_id,))
        total = cursor.fetchone()[0]
        cursor.execute(
            """SELECT c.id, c.document_id, c.chunk_index, c.content, c.created_at, d.filename, d.original_filename, g.name
                FROM rag_chunks c
                JOIN rag_documents d ON c.document_id = d.id
                JOIN rag_groups g ON c.group_id = g.id
                WHERE c.group_id = ?
                ORDER BY c.id
                LIMIT ? OFFSET ?""", (group_id, limit, offset)
        )
        chunks = []
        for row in cursor.fetchall():
            content = row[3]
            chunks.append({
                "id": row[0],
                "group_id": group_id,
                "document_id": row[1],
                "chunk_index": row[2],
                "content": content,
                "content_preview": content[:160] + ("..." if len(content) > 160 else ""),
                "content_length": len(content),
                "created_at": row[4],
                "filename": row[5],
                "original_filename": row[6],
                "group_name": row[7]
            })
        conn.close()
        return {"chunks": chunks, "total": total}

    def search_chunks_content(self, search_term: str, group_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        if group_id:
            cursor.execute(
                """SELECT c.id, c.document_id, c.chunk_index, c.content, d.filename, d.original_filename, g.name, c.group_id
                    FROM rag_chunks c
                    JOIN rag_documents d ON c.document_id = d.id
                    JOIN rag_groups g ON c.group_id = g.id
                    WHERE c.group_id = ? AND c.content LIKE ?
                    LIMIT ?""", (group_id, f"%{search_term}%", limit)
            )
        else:
            cursor.execute(
                """SELECT c.id, c.document_id, c.chunk_index, c.content, d.filename, d.original_filename, g.name, c.group_id
                    FROM rag_chunks c
                    JOIN rag_documents d ON c.document_id = d.id
                    JOIN rag_groups g ON c.group_id = g.id
                    WHERE c.content LIKE ?
                    LIMIT ?""", (f"%{search_term}%", limit)
            )
        rows = cursor.fetchall()
        conn.close()
        results = []
        for r in rows:
            content = r[3]
            results.append({
                "id": r[0],
                "document_id": r[1],
                "chunk_index": r[2],
                "content": content,
                "content_preview": content[:160] + ("..." if len(content) > 160 else ""),
                "filename": r[4],
                "original_filename": r[5],
                "group_name": r[6],
                "group_id": r[7]
            })
        return results

    def get_chunk_by_id(self, chunk_id: int) -> Optional[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            """SELECT c.id, c.group_id, c.document_id, c.chunk_index, c.content, c.created_at, d.filename, d.original_filename, g.name
                FROM rag_chunks c
                JOIN rag_documents d ON c.document_id = d.id
                JOIN rag_groups g ON c.group_id = g.id
                WHERE c.id = ?""", (chunk_id,)
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        return {
            "id": row[0],
            "group_id": row[1],
            "document_id": row[2],
            "chunk_index": row[3],
            "content": row[4],
            "content_length": len(row[4]),
            "created_at": row[5],
            "filename": row[6],
            "original_filename": row[7],
            "group_name": row[8]
        }

    def update_chunk_content(self, chunk_id: int, new_content: str) -> bool:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("UPDATE rag_chunks SET content = ? WHERE id = ?", (new_content, chunk_id))
        changed = cursor.rowcount > 0
        conn.commit()
        conn.close()
        if changed:
            # Rebuild index for group
            chunk = self.get_chunk_by_id(chunk_id)
            if chunk:
                self._rebuild_group_index(chunk['group_id'])
        return changed

    def delete_chunk(self, chunk_id: int) -> bool:
        # need group id to rebuild
        chunk = self.get_chunk_by_id(chunk_id)
        if not chunk:
            return False
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM rag_chunks WHERE id = ?", (chunk_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        if deleted:
            self._rebuild_group_index(chunk['group_id'])
        return deleted

    def bulk_delete_chunks(self, chunk_ids: List[int]) -> Dict[str, Any]:
        if not chunk_ids:
            return {"deleted": 0}
        # determine groups impacted
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        placeholders = ",".join("?" for _ in chunk_ids)
        cursor.execute(f"SELECT DISTINCT group_id FROM rag_chunks WHERE id IN ({placeholders})", chunk_ids)
        groups = [r[0] for r in cursor.fetchall()]
        cursor.execute(f"DELETE FROM rag_chunks WHERE id IN ({placeholders})", chunk_ids)
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        for g in groups:
            self._rebuild_group_index(g)
        return {"deleted": deleted}

    def cleanup_orphan_chunks(self) -> Dict[str, Any]:
        """Rimuove i chunks orfani (document_id non esistente) e ricostruisce gli indici dei gruppi impattati.

        Returns:
            Dict con numero di chunks rimossi e gruppi aggiornati.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # Trova chunks con document_id che non esiste più
        cursor.execute("""
            SELECT c.id, c.group_id FROM rag_chunks c
            LEFT JOIN rag_documents d ON c.document_id = d.id
            WHERE d.id IS NULL
        """)
        rows = cursor.fetchall()
        if not rows:
            conn.close()
            return {"removed": 0, "groups_reindexed": []}
        chunk_ids = [r[0] for r in rows]
        groups = sorted({r[1] for r in rows if r[1] is not None})
        placeholders = ",".join("?" for _ in chunk_ids)
        cursor.execute(f"DELETE FROM rag_chunks WHERE id IN ({placeholders})", chunk_ids)
        removed = cursor.rowcount
        conn.commit()
        conn.close()
        for g in groups:
            self._rebuild_group_index(g)
        return {"removed": removed, "groups_reindexed": groups}

    # ===== Storage & Files =====
    def get_document_file(self, document_id: int) -> Optional[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT filename, original_filename FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        conn.close()
        if not row:
            return None
        files_dir = self.data_dir / "files"
        file_path = files_dir / row[0]
        if not file_path.exists():
            return None
        mime_type = "application/octet-stream"
        try:
            import mimetypes
            mime_type = mimetypes.guess_type(row[1])[0] or mime_type
        except Exception:
            pass
        return {"filename": row[1], "file_bytes": file_path.read_bytes(), "mime_type": mime_type}

    def get_document_file_url(self, document_id: int) -> str:
        return f"/api/rag/download/{document_id}"

    def get_storage_stats(self) -> Dict[str, Any]:
        files_dir = self.data_dir / "files"
        stats = {
            "total_files": 0,
            "total_size_bytes": 0,
            "largest_files": [],
            "storage_by_type": {},
            "orphaned_files": []
        }
        if not files_dir.exists():
            return stats
        for p in files_dir.iterdir():
            if p.is_file():
                size = p.stat().st_size
                stats["total_files"] += 1
                stats["total_size_bytes"] += size
                ext = p.suffix.lower() or "none"
                stats["storage_by_type"].setdefault(ext, {"count": 0, "size": 0})
                stats["storage_by_type"][ext]["count"] += 1
                stats["storage_by_type"][ext]["size"] += size
                stats["largest_files"].append({"filename": p.name, "size": size})
        stats["largest_files"].sort(key=lambda x: x["size"], reverse=True)
        stats["largest_files"] = stats["largest_files"][:10]
        # orphan detection: files without document reference
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM rag_documents")
        valid = {r[0] for r in cursor.fetchall()}
        conn.close()
        for p in files_dir.iterdir():
            if p.is_file() and p.name not in valid:
                stats["orphaned_files"].append({"filename": p.name, "size": p.stat().st_size})
        return stats

    def cleanup_orphaned_files(self) -> Dict[str, Any]:
        files_dir = self.data_dir / "files"
        if not files_dir.exists():
            return {"removed": 0}
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT filename FROM rag_documents")
        valid = {r[0] for r in cursor.fetchall()}
        conn.close()
        removed = 0
        for p in files_dir.iterdir():
            if p.is_file() and p.name not in valid:
                try:
                    p.unlink()
                    removed += 1
                except Exception:
                    pass
        return {"removed": removed}

# Istanza globale
rag_engine = RAGEngine()
