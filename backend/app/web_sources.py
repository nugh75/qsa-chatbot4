"""
Web sources management module
Handles fetching, parsing, and caching content from authorized web URLs
"""
import re
import json
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from pypdf import PdfReader
from io import BytesIO

from .database import db_manager

# Import RAG engine for indexing
try:
    from .rag_engine import RAGEngine
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

# Configuration
FETCH_TIMEOUT = 10  # seconds
MAX_HTML_SIZE = 5 * 1024 * 1024  # 5MB
MAX_PDF_SIZE = 10 * 1024 * 1024  # 10MB
CACHE_EXPIRY_DAYS = 7  # Default cache expiry
USER_AGENT = "QSA-Chatbot/1.0 (Educational Purpose)"


class WebSourceError(Exception):
    """Custom exception for web source operations"""
    pass


def get_or_create_web_sources_group() -> int:
    """Get or create the RAG group for web sources"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        # Try to find existing group
        db_manager.exec(cursor, """
            SELECT id FROM rag_groups
            WHERE name = ?
        """, ('Web Sources',))

        row = cursor.fetchone()
        if row:
            return int(row['id'])

        # Create new group
        db_manager.exec(cursor, """
            INSERT INTO rag_groups (name, description, created_at)
            VALUES (?, ?, ?)
            RETURNING id
        """, ('Web Sources',
              'Contenuti scaricati da fonti web autorizzate',
              datetime.now()))

        group_id = int(cursor.fetchone()['id'])
        conn.commit()
        return group_id


def extract_domain(url: str) -> str:
    """Extract domain from URL"""
    parsed = urlparse(url)
    return parsed.netloc


def validate_url(url: str) -> bool:
    """Validate URL format and scheme"""
    try:
        parsed = urlparse(url)
        return parsed.scheme in ['http', 'https'] and bool(parsed.netloc)
    except Exception:
        return False


def sanitize_html(html_content: str) -> str:
    """Remove potentially dangerous HTML elements"""
    soup = BeautifulSoup(html_content, 'lxml')

    # Remove script, style, and other unwanted tags
    for tag in soup(['script', 'style', 'iframe', 'embed', 'object']):
        tag.decompose()

    return str(soup)


def html_to_text(html_content: str) -> str:
    """Convert HTML to clean text"""
    soup = BeautifulSoup(html_content, 'lxml')

    # Remove unwanted elements
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
        tag.decompose()

    # Get text
    text = soup.get_text(separator='\n', strip=True)

    # Clean up excessive whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)

    return text.strip()


def html_to_markdown(html_content: str) -> str:
    """Convert HTML to Markdown for better readability"""
    soup = BeautifulSoup(html_content, 'lxml')

    # Remove unwanted elements
    for tag in soup(['script', 'style', 'nav', 'header', 'footer', 'aside']):
        tag.decompose()

    # Convert to markdown
    markdown = md(str(soup), heading_style="ATX")

    return markdown.strip()


def pdf_to_text(pdf_content: bytes) -> str:
    """Extract text from PDF content"""
    try:
        pdf_file = BytesIO(pdf_content)
        pdf_reader = PdfReader(pdf_file)

        text_parts = []
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)

        return '\n\n'.join(text_parts).strip()
    except Exception as e:
        raise WebSourceError(f"Failed to extract text from PDF: {str(e)}")


async def fetch_url_content(url: str, source_type: str = 'html') -> Dict[str, Any]:
    """
    Fetch content from URL and parse it

    Args:
        url: The URL to fetch
        source_type: 'html' or 'pdf'

    Returns:
        Dict with content_text, content_markdown, title, metadata
    """
    if not validate_url(url):
        raise WebSourceError(f"Invalid URL: {url}")

    try:
        async with httpx.AsyncClient(timeout=FETCH_TIMEOUT) as client:
            headers = {'User-Agent': USER_AGENT}
            response = await client.get(url, headers=headers, follow_redirects=True)
            response.raise_for_status()

            # Check content size
            content_length = len(response.content)
            max_size = MAX_PDF_SIZE if source_type == 'pdf' else MAX_HTML_SIZE

            if content_length > max_size:
                raise WebSourceError(f"Content too large: {content_length} bytes (max: {max_size})")

            # Parse based on type
            if source_type == 'pdf' or response.headers.get('content-type', '').startswith('application/pdf'):
                return parse_pdf_content(response.content, url)
            else:
                return parse_html_content(response.text, url)

    except httpx.TimeoutException:
        raise WebSourceError(f"Timeout fetching URL: {url}")
    except httpx.HTTPError as e:
        raise WebSourceError(f"HTTP error fetching URL: {str(e)}")
    except Exception as e:
        raise WebSourceError(f"Error fetching URL: {str(e)}")


def parse_html_content(html: str, url: str) -> Dict[str, Any]:
    """Parse HTML content and extract structured data"""
    soup = BeautifulSoup(html, 'lxml')

    # Extract title
    title_tag = soup.find('title')
    title = title_tag.get_text(strip=True) if title_tag else urlparse(url).path

    # Extract metadata
    metadata = {
        'url': url,
        'type': 'html',
        'fetched_at': datetime.now().isoformat()
    }

    # Try to extract meta description
    meta_desc = soup.find('meta', attrs={'name': 'description'})
    if meta_desc and meta_desc.get('content'):
        metadata['description'] = meta_desc['content']

    # Sanitize and convert
    sanitized_html = sanitize_html(html)
    content_text = html_to_text(sanitized_html)
    content_markdown = html_to_markdown(sanitized_html)

    word_count = len(content_text.split())

    return {
        'content_text': content_text,
        'content_markdown': content_markdown,
        'title': title,
        'metadata': metadata,
        'word_count': word_count
    }


def parse_pdf_content(pdf_bytes: bytes, url: str) -> Dict[str, Any]:
    """Parse PDF content and extract structured data"""
    content_text = pdf_to_text(pdf_bytes)

    # Extract title from first line or use URL
    lines = content_text.split('\n')
    title = lines[0][:100] if lines else urlparse(url).path

    metadata = {
        'url': url,
        'type': 'pdf',
        'fetched_at': datetime.now().isoformat()
    }

    word_count = len(content_text.split())

    return {
        'content_text': content_text,
        'content_markdown': content_text,  # PDF already plain text
        'title': title,
        'metadata': metadata,
        'word_count': word_count
    }


# Database operations

def create_web_source(url: str, description: str, created_by: int,
                     is_active: bool = True, show_to_users: bool = True) -> Dict[str, Any]:
    """Create a new web source entry"""
    if not validate_url(url):
        raise WebSourceError(f"Invalid URL: {url}")

    domain = extract_domain(url)

    # Detect source type from URL
    source_type = 'pdf' if url.lower().endswith('.pdf') else 'html'

    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        query = """
            INSERT INTO allowed_web_sources
            (url, domain, description, source_type, is_active, show_to_users, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, url, domain, title, description, source_type, is_active,
                      show_to_users, created_at, updated_at, last_fetched, fetch_count
        """

        db_manager.exec(cursor, query, (url, domain, description, source_type,
                                       is_active, show_to_users, created_by))

        row = cursor.fetchone()
        conn.commit()

        return dict(row) if row else None


def get_web_sources(active_only: bool = False, visible_only: bool = False) -> List[Dict[str, Any]]:
    """Get all web sources with optional filtering"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        where_clauses = []
        params = []

        if active_only:
            where_clauses.append("is_active = ?")
            params.append(True)

        if visible_only:
            where_clauses.append("show_to_users = ?")
            params.append(True)

        where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"

        query = f"""
            SELECT id, url, domain, title, description, source_type, is_active,
                   show_to_users, created_at, updated_at, last_fetched, fetch_count
            FROM allowed_web_sources
            WHERE {where_sql}
            ORDER BY created_at DESC
        """

        db_manager.exec(cursor, query, tuple(params))
        rows = cursor.fetchall()

        return [dict(row) for row in rows]


def get_web_source_by_id(source_id: int) -> Optional[Dict[str, Any]]:
    """Get a specific web source by ID"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        query = """
            SELECT id, url, domain, title, description, source_type, is_active,
                   show_to_users, created_at, updated_at, last_fetched, fetch_count
            FROM allowed_web_sources
            WHERE id = ?
        """

        db_manager.exec(cursor, query, (source_id,))
        row = cursor.fetchone()

        return dict(row) if row else None


def update_web_source(source_id: int, **kwargs) -> bool:
    """Update web source fields"""
    allowed_fields = ['url', 'description', 'is_active', 'show_to_users']

    updates = {k: v for k, v in kwargs.items() if k in allowed_fields}

    if not updates:
        return False

    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        set_clause = ", ".join([f"{k} = ?" for k in updates.keys()])
        values = list(updates.values()) + [source_id]

        query = f"""
            UPDATE allowed_web_sources
            SET {set_clause}
            WHERE id = ?
        """

        db_manager.exec(cursor, query, tuple(values))
        conn.commit()

        return cursor.rowcount > 0


def delete_web_source(source_id: int) -> bool:
    """Delete a web source and its cache"""
    # Get source info before deletion
    source = get_web_source_by_id(source_id)

    # Delete RAG document if exists
    if RAG_AVAILABLE and source:
        try:
            rag_engine = RAGEngine()
            group_id = get_or_create_web_sources_group()
            doc_filename = f"web_source_{source_id}_{source['domain']}.md"

            # Find and delete the RAG document
            with db_manager.get_connection() as conn:
                cursor = conn.cursor()
                db_manager.exec(cursor, """
                    SELECT id FROM rag_documents
                    WHERE group_id = ? AND filename = ?
                """, (group_id, doc_filename))
                row = cursor.fetchone()
                if row:
                    doc_id = int(row['id'])
                    # Delete document (this will cascade to chunks)
                    db_manager.exec(cursor, "DELETE FROM rag_documents WHERE id = ?", (doc_id,))
                    conn.commit()
        except Exception as e:
            print(f"Warning: Failed to delete RAG document for web source: {e}")

    # Delete web source
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        query = "DELETE FROM allowed_web_sources WHERE id = ?"
        db_manager.exec(cursor, query, (source_id,))
        conn.commit()

        return cursor.rowcount > 0


async def fetch_and_cache_source(source_id: int) -> Dict[str, Any]:
    """Fetch content from source URL and cache it"""
    source = get_web_source_by_id(source_id)

    if not source:
        raise WebSourceError(f"Web source not found: {source_id}")

    # Fetch content
    content_data = await fetch_url_content(source['url'], source['source_type'])

    # Update source title if not set
    if not source.get('title'):
        with db_manager.get_connection() as conn:
            cursor = conn.cursor()
            db_manager.exec(cursor,
                          "UPDATE allowed_web_sources SET title = ? WHERE id = ?",
                          (content_data['title'], source_id))
            conn.commit()

    # Cache the content
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        # Delete existing cache
        db_manager.exec(cursor, "DELETE FROM web_content_cache WHERE source_id = ?", (source_id,))

        # Insert new cache
        query = """
            INSERT INTO web_content_cache
            (source_id, url, content_text, content_markdown, title, metadata, word_count, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """

        expires_at = datetime.now() + timedelta(days=CACHE_EXPIRY_DAYS)

        db_manager.exec(cursor, query, (
            source_id,
            source['url'],
            content_data['content_text'],
            content_data['content_markdown'],
            content_data['title'],
            json.dumps(content_data['metadata']),  # Convert dict to JSON string
            content_data['word_count'],
            expires_at
        ))

        # Update fetch stats
        db_manager.exec(cursor, """
            UPDATE allowed_web_sources
            SET last_fetched = ?, fetch_count = fetch_count + 1
            WHERE id = ?
        """, (datetime.now(), source_id))

        conn.commit()

    # Index content in RAG if available
    if RAG_AVAILABLE and source.get('show_to_users', True):
        try:
            rag_engine = RAGEngine()
            group_id = get_or_create_web_sources_group()

            # Use markdown version for better structure
            content_to_index = content_data['content_markdown']

            # Create document filename from URL
            doc_filename = f"web_source_{source_id}_{source['domain']}.md"

            # Add to RAG (this will create chunks and embeddings)
            rag_engine.add_document(
                group_id=group_id,
                filename=doc_filename,
                content=content_to_index,
                original_filename=source['url']
            )
        except Exception as e:
            # Log error but don't fail the whole operation
            print(f"Warning: Failed to index web source in RAG: {e}")

    return content_data


def get_cached_content(source_id: int) -> Optional[Dict[str, Any]]:
    """Get cached content for a source if available and not expired"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        query = """
            SELECT id, source_id, url, content_text, content_markdown, title,
                   metadata, word_count, fetched_at, expires_at
            FROM web_content_cache
            WHERE source_id = ? AND (expires_at IS NULL OR expires_at > ?)
        """

        db_manager.exec(cursor, query, (source_id, datetime.now()))
        row = cursor.fetchone()

        return dict(row) if row else None


def search_in_cached_content(query: str, limit: int = 5) -> List[Dict[str, Any]]:
    """Search for query in cached web content"""
    with db_manager.get_connection() as conn:
        cursor = conn.cursor()

        sql_query = """
            SELECT
                c.id,
                s.id as source_id,
                s.url,
                s.title as source_title,
                c.title,
                c.content_text,
                c.content_markdown,
                c.word_count,
                s.show_to_users
            FROM web_content_cache c
            JOIN allowed_web_sources s ON c.source_id = s.id
            WHERE s.is_active = ?
              AND (c.content_text LIKE ? OR c.title LIKE ?)
              AND (c.expires_at IS NULL OR c.expires_at > ?)
            ORDER BY c.fetched_at DESC
            LIMIT ?
        """

        search_pattern = f"%{query}%"
        db_manager.exec(cursor, sql_query, (True, search_pattern, search_pattern,
                                           datetime.now(), limit))

        rows = cursor.fetchall()

        results = []
        for row in rows:
            r = dict(row)

            # Extract snippet around query match
            content = r['content_text']
            query_lower = query.lower()
            content_lower = content.lower()

            idx = content_lower.find(query_lower)
            if idx >= 0:
                start = max(0, idx - 100)
                end = min(len(content), idx + len(query) + 100)
                snippet = content[start:end]
                if start > 0:
                    snippet = "..." + snippet
                if end < len(content):
                    snippet = snippet + "..."
            else:
                snippet = content[:200] + "..." if len(content) > 200 else content

            r['snippet'] = snippet
            results.append(r)

        return results
