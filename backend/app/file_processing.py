"""File processing utilities.

Estrazione testo supportata per:
- PDF (pypdf / PyPDF2)
- DOCX/DOC (python-docx)
- TXT / MD (lettura diretta)
- CSV (csv standard library)
- XLSX/XLS (openpyxl o xlrd opzionale; fallback parsing basico se assente)
- HTML / HTM (BeautifulSoup se disponibile, altrimenti strip tag grezzo)
- RTF (striprtf se disponibile, altrimenti pulizia semplificata)
- JSON (flatten ricorsivo concatenando valori stringa / numeri)
- XML (BeautifulSoup / ElementTree)

Se la libreria opzionale non è installata, restituisce messaggio di errore che il frontend può intercettare.
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
import os
import tempfile
import uuid
from datetime import datetime
import mimetypes
import csv
import json
from typing import Iterable

try:
    import openpyxl  # type: ignore
except ImportError:  # pragma: no cover
    openpyxl = None

try:  # Legacy xls
    import xlrd  # type: ignore
except ImportError:  # pragma: no cover
    xlrd = None

try:
    from bs4 import BeautifulSoup  # type: ignore
except ImportError:  # pragma: no cover
    BeautifulSoup = None

try:
    from striprtf.striprtf import rtf_to_text  # type: ignore
except ImportError:  # pragma: no cover
    rtf_to_text = None

# Import libraries for file processing
try:
    import PyPDF2
    import pypdf
except ImportError:
    PyPDF2 = None
    pypdf = None

try:
    from docx import Document
except ImportError:
    Document = None

class ProcessedFile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    content: str
    file_type: str
    base64_data: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None
    processed_at: Optional[datetime] = None
    error: Optional[str] = None

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text content from PDF file"""
    text = ""
    
    print(f"🔍 Attempting to extract text from PDF: {file_path}")
    
    # Check which PDF library is available
    print(f"🔍 pypdf available: {pypdf is not None}")
    print(f"🔍 PyPDF2 available: {PyPDF2 is not None}")
    
    if pypdf:
        print("📚 Using pypdf library")
        try:
            with open(file_path, 'rb') as file:
                reader = pypdf.PdfReader(file)
                print(f"📄 PDF has {len(reader.pages)} pages")
                
                for page_num, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    except Exception as e:
                        print(f"⚠️ Error extracting text from page {page_num + 1}: {e}")
                        continue
        except Exception as e:
            print(f"❌ pypdf error: {e}")
            text = ""
    
    elif PyPDF2:
        print("📚 Using PyPDF2 library")
        try:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                print(f"📄 PDF has {len(reader.pages)} pages")
                
                for page_num, page in enumerate(reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    except Exception as e:
                        print(f"⚠️ Error extracting text from page {page_num + 1}: {e}")
                        continue
        except Exception as e:
            print(f"❌ PyPDF2 error: {e}")
            text = ""
    
    else:
        print("❌ No PDF library available")
        text = "Errore: Nessuna libreria PDF disponibile"
    
    print(f"✅ Extracted {len(text)} characters from PDF")
    return text.strip()

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from DOCX file"""
    if not Document:
        return "python-docx library not available"
    
    try:
        doc = Document(file_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text.strip()
    except Exception as e:
        return f"Error extracting text from DOCX: {str(e)}"

def extract_text_from_csv(file_path: str, delimiter: str = ',') -> str:
    """Extract text from CSV by joining rows with newlines."""
    try:
        lines = []
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f, delimiter=delimiter)
            for row in reader:
                if any(cell.strip() for cell in row):
                    lines.append(" \t ".join(cell.strip() for cell in row))
        return "\n".join(lines).strip()
    except Exception as e:
        return f"Errore: impossibile leggere CSV ({e})"

def _flatten_json(value, acc: list):
    if value is None:
        return
    if isinstance(value, (str, int, float)):
        acc.append(str(value))
    elif isinstance(value, dict):
        for v in value.values():
            _flatten_json(v, acc)
    elif isinstance(value, Iterable) and not isinstance(value, (str, bytes)):
        for v in value:
            _flatten_json(v, acc)

def extract_text_from_json(file_path: str) -> str:
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            data = json.load(f)
        acc: list[str] = []
        _flatten_json(data, acc)
        text = "\n".join(acc).strip()
        return text or ""
    except Exception as e:
        return f"Errore: impossibile leggere JSON ({e})"

def extract_text_from_excel(file_path: str) -> str:
    if openpyxl:
        try:
            wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
            lines = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    vals = [str(c).strip() for c in row if c is not None and str(c).strip()]
                    if vals:
                        lines.append(" \t ".join(vals))
            return "\n".join(lines).strip()
        except Exception as e:
            return f"Errore: impossibile leggere XLSX ({e})"
    if xlrd:  # fallback xls
        try:
            book = xlrd.open_workbook(file_path)
            lines = []
            for sheet in book.sheets():
                for r in range(sheet.nrows):
                    cells = [str(sheet.cell_value(r, c)).strip() for c in range(sheet.ncols) if str(sheet.cell_value(r, c)).strip()]
                    if cells:
                        lines.append(" \t ".join(cells))
            return "\n".join(lines).strip()
        except Exception as e:
            return f"Errore: impossibile leggere XLS ({e})"
    return "Errore: nessuna libreria Excel disponibile (installa openpyxl)"

def extract_text_from_html(file_path: str) -> str:
    try:
        raw = open(file_path, 'r', encoding='utf-8', errors='ignore').read()
        if BeautifulSoup:
            soup = BeautifulSoup(raw, 'html.parser')
            # Rimuovi script/style
            for tag in soup(['script', 'style']):
                tag.decompose()
            text = soup.get_text(separator='\n')
            # Normalizza spazi
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            return "\n".join(lines)
        # Fallback: strip rudimentale tag
        import re
        no_tags = re.sub(r'<[^>]+>', ' ', raw)
        return ' '.join(no_tags.split())
    except Exception as e:
        return f"Errore: impossibile leggere HTML ({e})"

def extract_text_from_rtf(file_path: str) -> str:
    try:
        raw = open(file_path, 'r', encoding='utf-8', errors='ignore').read()
        if rtf_to_text:
            return rtf_to_text(raw).strip()
        # Fallback: rimuovi gruppi RTF basilari
        import re
        txt = re.sub(r'\\[a-zA-Z]+[0-9]? ?', ' ', raw)  # comandi
        txt = re.sub(r'[{}]', ' ', txt)  # braces
        return ' '.join(txt.split())
    except Exception as e:
        return f"Errore: impossibile leggere RTF ({e})"

def extract_text_from_xml(file_path: str) -> str:
    # Tenta BeautifulSoup, fallback ElementTree
    try:
        raw = open(file_path, 'r', encoding='utf-8', errors='ignore').read()
        if BeautifulSoup:
            soup = BeautifulSoup(raw, 'xml')
            text = soup.get_text(separator='\n')
            lines = [l.strip() for l in text.splitlines() if l.strip()]
            return "\n".join(lines)
        import xml.etree.ElementTree as ET
        root = ET.fromstring(raw)
        parts = []
        def walk(el):
            if el.text and el.text.strip():
                parts.append(el.text.strip())
            for c in el:
                walk(c)
        walk(root)
        return "\n".join(parts)
    except Exception as e:
        return f"Errore: impossibile leggere XML ({e})"

# Create router
router = APIRouter()

@router.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """Upload and process multiple files"""
    processed_files = []
    
    for upload_file in files:
        try:
            print(f"🔍 Processing file: {upload_file.filename}")
            print(f"🔍 Content type: {upload_file.content_type}")
            
            # Read file content
            content = await upload_file.read()
            print(f"🔍 File size: {len(content)}")
            
            # Get file extension
            filename = upload_file.filename or "unknown"
            file_ext = filename.split('.')[-1].lower() if '.' in filename else ''
            print(f"🔍 File extension: {file_ext}")
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name
                print(f"🔍 Temporary file created: {temp_file_path}")
            
            # Determine expected MIME type
            expected_mime = mimetypes.guess_type(filename)[0]
            
            # Create base processed file
            processed_file = ProcessedFile(
                id=str(uuid.uuid4()),
                filename=filename,
                content="",
                file_type=file_ext,
                mime_type=upload_file.content_type or expected_mime,
                size=len(content),
                processed_at=datetime.now()
            )
            
            # Process based on file type - ONLY TEXT EXTRACTION
            if file_ext == 'pdf':
                print(f"📄 Processing PDF file: {filename}")
                text_content = extract_text_from_pdf(temp_file_path)
                processed_file.content = text_content
                
            elif file_ext in ['docx', 'doc']:
                text_content = extract_text_from_docx(temp_file_path)
                processed_file.content = text_content
                
            elif file_ext in ['txt', 'md']:
                # Per file di testo semplici (TXT, Markdown)
                try:
                    with open(temp_file_path, 'r', encoding='utf-8') as f:
                        processed_file.content = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(temp_file_path, 'r', encoding='latin-1') as f:
                            processed_file.content = f.read()
                    except Exception as e:
                        processed_file.content = f"Impossibile leggere il file come testo: {str(e)}"
                
            else:
                # File non supportato
                processed_file.content = f"Tipo di file non supportato: {file_ext}. Supportati: PDF, Word (DOCX/DOC), TXT, Markdown (MD)"
            
            processed_files.append(processed_file)
            print(f"✅ Processed file: {filename} ({file_ext})")
            
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except:
                pass
                
        except Exception as e:
            print(f"❌ Error processing file {upload_file.filename}: {e}")
            # Add error file to results
            processed_files.append(ProcessedFile(
                id=str(uuid.uuid4()),
                filename=upload_file.filename or "unknown",
                content=f"Errore nel processamento del file: {str(e)}",
                file_type="error",
                mime_type="application/octet-stream",
                size=0,
                processed_at=datetime.now(),
                error=str(e)
            ))
    
    return {"files": processed_files}

@router.get("/supported-types")
async def get_supported_types():
    """Get list of supported file types - ONLY TEXT FILES"""
    return {
        "supported_types": [
            {
                "extension": "pdf",
                "description": "PDF Document",
                "mime_types": ["application/pdf"]
            },
            {
                "extension": "docx",
                "description": "Microsoft Word Document",
                "mime_types": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
            },
            {
                "extension": "doc",
                "description": "Microsoft Word Document (Legacy)",
                "mime_types": ["application/msword"]
            },
            {
                "extension": "txt",
                "description": "Text File",
                "mime_types": ["text/plain"]
            },
            {
                "extension": "md",
                "description": "Markdown File",
                "mime_types": ["text/markdown", "text/x-markdown"]
            }
        ],
        "note": "Solo file di testo sono supportati. Immagini non permesse."
    }
