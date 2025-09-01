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
        # Auto-clean chunks orfani all'avvio (best-effort)
        try:
            removed = self.delete_orphan_chunks()
            if removed:
                logger.info(f"Auto-clean avvio: rimossi {removed} chunks orfani")
        except Exception as e:
            logger.warning(f"Auto-clean orfani fallito: {e}")
        
    def _init_database(self):
        """Inizializza il database SQLite per metadati"""
        conn = sqlite3.connect(str(self.db_path))
        try:
            conn.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass
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
                stored_filename TEXT,
                file_hash TEXT NOT NULL,
                file_size INTEGER,
                content_preview TEXT,
                chunk_count INTEGER DEFAULT 0,
                archived INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (group_id) REFERENCES rag_groups (id) ON DELETE CASCADE
            )
        """)
        # Migrazione soft per colonna archived (se la tabella esisteva prima della modifica)
        try:
            cursor.execute("PRAGMA table_info(rag_documents)")
            cols = [r[1] for r in cursor.fetchall()]
            if 'archived' not in cols:
                cursor.execute("ALTER TABLE rag_documents ADD COLUMN archived INTEGER DEFAULT 0")
            if 'updated_at' not in cols:
                cursor.execute("ALTER TABLE rag_documents ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
        except Exception:
            pass
        # Crea indice/constraint composto se non esiste già (SQLite non consente alter unique direttamente, verifichiamo pragma)
        try:
            cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_hash_group ON rag_documents(file_hash, group_id)")
        except Exception:
            pass
        
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

    def recover_missing_groups(self) -> Dict[str, Any]:
        """Crea gruppi placeholder per ogni group_id referenziato in rag_documents che non esiste in rag_groups.

        Returns:
            dict con keys: created (int), recovered (list[{id,name}])
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        created: list[Dict[str, Any]] = []
        try:
            cursor.execute("SELECT DISTINCT group_id FROM rag_documents WHERE group_id IS NOT NULL AND group_id != 0")
            gids = [r[0] for r in cursor.fetchall() if r[0] is not None]
            if not gids:
                return {"created": 0, "recovered": []}
            # Recupera quelli che mancano
            placeholders = ",".join(["?"] * len(gids))
            cursor.execute(f"SELECT id FROM rag_groups WHERE id IN ({placeholders})", gids)
            existing = {r[0] for r in cursor.fetchall()}
            missing = [g for g in gids if g not in existing]
            for mid in missing:
                name = f"Recuperato_{mid}"
                cursor.execute("INSERT INTO rag_groups (id, name, description) VALUES (?, ?, ?)", (mid, name, "Gruppo ricostruito automaticamente"))
                created.append({"id": mid, "name": name})
            if created:
                conn.commit()
        finally:
            conn.close()
        if created:
            logger.warning(f"Recover missing groups: creati {len(created)} gruppi placeholder")
        return {"created": len(created), "recovered": created}
        
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

    def get_ungrouped_documents(self) -> List[Dict[str, Any]]:
        """Restituisce documenti senza gruppo (group_id NULL)"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id, filename, original_filename, file_size, content_preview, chunk_count, created_at
            FROM rag_documents
            WHERE group_id IS NULL OR group_id = 0
            ORDER BY created_at DESC
            """
        )
        docs = []
        for row in cursor.fetchall():
            docs.append({
                "id": row[0],
                "filename": row[1],
                "original_filename": row[2],
                "file_size": row[3],
                "content_preview": row[4],
                "chunk_count": row[5],
                "created_at": row[6]
            })
        conn.close()
        return docs

    def reassign_orphan_documents(self) -> int:
        """Crea (se mancante) un gruppo speciale 'Orfani' e vi sposta tutti i documenti con group_id NULL o 0.

        Returns:
            Numero di documenti riassegnati.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        moved = 0
        try:
            # Assicura gruppo esistente (nome univoco)
            cursor.execute("SELECT id FROM rag_groups WHERE name = ?", ("Orfani",))
            row = cursor.fetchone()
            if row:
                orphan_group_id = row[0]
            else:
                cursor.execute("INSERT INTO rag_groups (name, description) VALUES (?, ?)", ("Orfani", "Documenti senza gruppo esplicito"))
                orphan_group_id = cursor.lastrowid
            # Trova documenti senza gruppo
            cursor.execute("SELECT id FROM rag_documents WHERE group_id IS NULL OR group_id = 0")
            ids = [r[0] for r in cursor.fetchall()]
            if ids:
                placeholders = ",".join(["?"] * len(ids))
                cursor.execute(f"UPDATE rag_documents SET group_id = ? WHERE id IN ({placeholders})", [orphan_group_id, *ids])
                moved = len(ids)
            conn.commit()
        finally:
            conn.close()
        if moved:
            logger.info(f"Riassegnati {moved} documenti orfani al gruppo {orphan_group_id}")
        return moved
    
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
    
    def add_document(self, group_id: int, filename: str, content: str, original_filename: str = None, stored_filename: str | None = None) -> int:
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
            # Verifica presenza colonna stored_filename (migrazione soft)
            try:
                cursor.execute("PRAGMA table_info(rag_documents)")
                cols = [r[1] for r in cursor.fetchall()]
                has_stored = 'stored_filename' in cols
            except Exception:
                has_stored = False
            if has_stored:
                cursor.execute("""
                    INSERT INTO rag_documents 
                    (group_id, filename, original_filename, stored_filename, file_hash, file_size, content_preview)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (group_id, filename, original_filename, stored_filename, file_hash, len(content), content_preview))
            else:
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
            # Verifica se esiste già stesso hash nello stesso gruppo
            cursor.execute("SELECT id FROM rag_documents WHERE file_hash = ? AND group_id = ?", (file_hash, group_id))
            row = cursor.fetchone()
            if row:
                existing_id = row[0]
                logger.info(f"Documento duplicato nello stesso gruppo: reuse id {existing_id}")
                return existing_id
            # Altrimenti esiste in altro gruppo: consentito (perché unique è su coppia); se arriviamo qui c'è altro problema
            raise ValueError(f"Documento con hash '{file_hash}' già esistente")
        finally:
            conn.close()

    def migrate_unique_hash_per_group(self):
        """Migrazione (best-effort) per passare da UNIQUE(file_hash) a UNIQUE(file_hash, group_id).
        Può essere richiamata manualmente se l'istanza era già avviata con il vincolo vecchio.
        """
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        try:
            # Verifica se esiste indice vecchio (non nominato) controllando schema
            cursor.execute("PRAGMA index_list(rag_documents)")
            indexes = cursor.fetchall()
            have_composite = any("idx_documents_hash_group" in (idx[1] or '') for idx in indexes)
            if not have_composite:
                try:
                    cursor.execute("CREATE UNIQUE INDEX idx_documents_hash_group ON rag_documents(file_hash, group_id)")
                except Exception:
                    pass
            conn.commit()
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
        # Recupera embeddings solo dei documenti non archiviati (se colonna presente)
        has_archived = False
        try:
            cursor.execute("PRAGMA table_info(rag_documents)")
            cols = [r[1] for r in cursor.fetchall()]
            has_archived = 'archived' in cols
        except Exception:
            has_archived = False
        if has_archived:
            cursor.execute(
                """SELECT c.id, c.embedding_vector FROM rag_chunks c
                    JOIN rag_documents d ON c.document_id = d.id
                    WHERE c.group_id = ? AND (d.archived IS NULL OR d.archived = 0)
                    ORDER BY c.id""",
                (group_id,)
            )
        else:
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
                   d.id as document_id, d.filename, d.original_filename, d.stored_filename
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
                "original_filename": row[6],
                "stored_filename": row[7]
            })
        
        conn.close()
        return results
    
    def get_group_documents(self, group_id: int) -> List[Dict[str, Any]]:
        """Recupera tutti i documenti di un gruppo"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        # Verifica che la colonna stored_filename esista (installazioni precedenti potrebbero non averla)
        try:
            cursor.execute("PRAGMA table_info(rag_documents)")
            cols = [r[1] for r in cursor.fetchall()]
            has_stored = 'stored_filename' in cols
            if not has_stored:
                try:
                    cursor.execute("ALTER TABLE rag_documents ADD COLUMN stored_filename TEXT")
                    has_stored = True
                except Exception:
                    has_stored = False
        except Exception:
            has_stored = False

        # Verifica presenza colonna archived
        try:
            cursor.execute("PRAGMA table_info(rag_documents)")
            cols2 = [r[1] for r in cursor.fetchall()]
            has_archived_col = 'archived' in cols2
        except Exception:
            has_archived_col = False

        select_archived = ", archived" if has_archived_col else ", 0 as archived"
        stored_expr = "stored_filename" if has_stored else "NULL as stored_filename"
        has_updated = False
        try:
            cursor.execute("PRAGMA table_info(rag_documents)")
            colnames = [r[1] for r in cursor.fetchall()]
            has_updated = 'updated_at' in colnames
        except Exception:
            has_updated = False
        order_col = 'updated_at' if has_updated else 'created_at'
        cursor.execute(f"""
            SELECT id, filename, original_filename, {stored_expr}, file_size, content_preview, chunk_count, created_at, COALESCE(updated_at, created_at) as updated_at {select_archived}
            FROM rag_documents
            WHERE group_id = ?
            ORDER BY {order_col} DESC
        """, (group_id,))
        
        documents = []
        for row in cursor.fetchall():
            documents.append({
                "id": row[0],
                "filename": row[1],
                "original_filename": row[2],
                "stored_filename": row[3],
                "file_size": row[4],
                "content_preview": row[5],
                "chunk_count": row[6],
                "created_at": row[7],
                "updated_at": row[8],
                "archived": row[9] if len(row) > 9 else 0
            })
        
        conn.close()
        return documents

    # --- Document operations ---
    def get_document(self, document_id: int) -> Optional[Dict[str, Any]]:
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("PRAGMA table_info(rag_documents)")
        cols = [r[1] for r in cursor.fetchall()]
        has_archived = 'archived' in cols
        select_archived = ", archived" if has_archived else ", 0 as archived"
        cursor.execute(f"SELECT id, group_id, filename, original_filename, stored_filename, file_size, file_hash, content_preview, chunk_count, created_at{select_archived} FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None
        doc = {
            "id": row[0],
            "group_id": row[1],
            "filename": row[2],
            "original_filename": row[3],
            "stored_filename": row[4],
            "file_size": row[5],
            "file_hash": row[6],
            "content_preview": row[7],
            "chunk_count": row[8],
            "created_at": row[9],
            "archived": row[10] if len(row) > 10 else 0
        }
        conn.close()
        return doc

    def rename_document(self, document_id: int, new_filename: str):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("UPDATE rag_documents SET filename = ? WHERE id = ?", (new_filename, document_id))
        conn.commit()
        conn.close()

    def move_document(self, document_id: int, new_group_id: int):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT group_id FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise ValueError("Documento non trovato")
        old_group = row[0]
        cursor.execute("UPDATE rag_documents SET group_id = ? WHERE id = ?", (new_group_id, document_id))
        cursor.execute("UPDATE rag_chunks SET group_id = ? WHERE document_id = ?", (new_group_id, document_id))
        conn.commit()
        conn.close()
        # Rebuild indices for both groups
        if old_group:
            self._rebuild_group_index(old_group)
        self._rebuild_group_index(new_group_id)

    def duplicate_document(self, document_id: int, target_group_id: int) -> int:
        # Reconstruct text by concatenating chunks ordered by chunk_index
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT filename, original_filename FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise ValueError("Documento non trovato")
        filename, original_filename = row
        cursor.execute("SELECT content FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index", (document_id,))
        parts = [r[0] for r in cursor.fetchall()]
        conn.close()
        full_text = "\n".join(parts)
        # Aggiunge suffisso al filename per evitare confusione
        base_name = filename
        new_name = base_name
        if target_group_id:
            new_name = f"{base_name}"  # keep same name; uniqueness non forzata
        new_id = self.add_document(target_group_id, new_name, full_text, original_filename=original_filename)
        return new_id

    def reprocess_document(self, document_id: int, chunk_size: Optional[int] = None, chunk_overlap: Optional[int] = None):
        # Retrieve document text by joining chunks; could be optimized by caching original text separately.
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT group_id FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise ValueError("Documento non trovato")
        group_id = row[0]
        cursor.execute("SELECT content FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index", (document_id,))
        parts = [r[0] for r in cursor.fetchall()]
        # Delete old chunks
        cursor.execute("DELETE FROM rag_chunks WHERE document_id = ?", (document_id,))
        conn.commit()
        conn.close()
        full_text = "\n".join(parts)
        # Temporarily adjust splitter
        old_splitter = self.text_splitter
        if chunk_size or chunk_overlap:
            self.text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size or getattr(old_splitter, '_chunk_size', 1000),
                chunk_overlap=chunk_overlap or getattr(old_splitter, '_chunk_overlap', 200),
                length_function=len,
                separators=["\n\n", "\n", ". ", "! ", "? ", ", ", " ", ""]
            )
        try:
            new_count = self._process_document(document_id, group_id, full_text)
            conn2 = sqlite3.connect(self.db_path)
            cur2 = conn2.cursor()
            cur2.execute("UPDATE rag_documents SET chunk_count = ? WHERE id = ?", (new_count, document_id))
            conn2.commit()
            conn2.close()
            return new_count
        finally:
            self.text_splitter = old_splitter

    def export_document(self, document_id: int) -> Dict[str, Any]:
        doc = self.get_document(document_id)
        if not doc:
            raise ValueError("Documento non trovato")
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT id, chunk_index, content, metadata FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index", (document_id,))
        chunks = []
        for r in cursor.fetchall():
            md = json.loads(r[3]) if r[3] else {}
            chunks.append({
                "id": r[0],
                "chunk_index": r[1],
                "content": r[2],
                "metadata": md
            })
        conn.close()
        return {"document": doc, "chunks": chunks}

    def set_document_archived(self, document_id: int, archived: bool):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT group_id FROM rag_documents WHERE id = ?", (document_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            raise ValueError("Documento non trovato")
        group_id = row[0]
        cursor.execute("UPDATE rag_documents SET archived = ? WHERE id = ?", (1 if archived else 0, document_id))
        conn.commit()
        conn.close()
        # rebuild index to exclude/include document
        self._rebuild_group_index(group_id)
    
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

        # Conta chunks orfani (non ancora puliti se avvenuto dopo avvio)
        cursor.execute("""
            SELECT COUNT(c.id)
            FROM rag_chunks c
            LEFT JOIN rag_documents d ON c.document_id = d.id
            WHERE d.id IS NULL
        """)
        orphan_chunks = cursor.fetchone()[0]
        
        cursor.execute("SELECT SUM(file_size) FROM rag_documents")
        total_size = cursor.fetchone()[0] or 0
        
        conn.close()
        
        return {
            "total_groups": total_groups,
            "total_documents": total_documents,
            "total_chunks": total_chunks,
            "total_size_bytes": total_size,
            "embedding_model": self.model_name,
            "embedding_dimension": self.dimension,
            "orphan_chunks": orphan_chunks
        }

    # --- Orphan chunks utilities ---
    def count_orphan_chunks(self) -> int:
        """Conta i chunks senza documento associato (document_id non esiste più)."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COUNT(c.id)
            FROM rag_chunks c
            LEFT JOIN rag_documents d ON c.document_id = d.id
            WHERE d.id IS NULL
        """)
        n = cursor.fetchone()[0] or 0
        conn.close()
        return n

    def delete_orphan_chunks(self) -> int:
        """Elimina tutti i chunks senza documento e ritorna quanti sono stati rimossi."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        cursor.execute("""
            SELECT c.id
            FROM rag_chunks c
            LEFT JOIN rag_documents d ON c.document_id = d.id
            WHERE d.id IS NULL
        """)
        ids = [r[0] for r in cursor.fetchall()]
        removed = 0
        if ids:
            placeholders = ",".join(["?"]*len(ids))
            cursor.execute(f"DELETE FROM rag_chunks WHERE id IN ({placeholders})", ids)
            removed = cursor.rowcount
            conn.commit()
        conn.close()
        if removed:
            logger.info(f"Eliminati {removed} chunks orfani")
        return removed

# Istanza globale
rag_engine = RAGEngine()
