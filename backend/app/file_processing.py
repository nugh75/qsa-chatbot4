"""
File processing functionality for text files only (PDF, Word, TXT, MD)
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

# Import libraries for file processing
try:
    import PyPDF2
    import pypdf
except ImportError:
    PyPDF2 = None
    pypdf = None
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

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

def extract_text_from_pdf_with_diagnostics(file_path: str, min_chars_threshold: int = 200) -> Dict[str, Any]:
    """Extract text from PDF trying multiple libraries and return diagnostics.

    Order:
      1. pypdf (if available)
      2. PyPDF2 (fallback)
      3. PyMuPDF (fitz) (used as fallback if previous methods missing or produced too little text)

    If initial method yields < min_chars_threshold chars and PyMuPDF is available, re-extract with PyMuPDF.
    """
    chosen_method = None
    fallback_used = False
    text = ""
    page_count = 0
    errors: list[str] = []
    print(f"🔍 PDF extraction diagnostics for {file_path}")
    print(f"   libs => pypdf={bool(pypdf)} PyPDF2={bool(PyPDF2)} fitz={bool(fitz)}")

    def _extract_with_pypdf():
        nonlocal text, page_count
        with open(file_path, 'rb') as f:
            reader = pypdf.PdfReader(f)
            page_count = len(reader.pages)
            for page_num, page in enumerate(reader.pages):
                try:
                    pt = page.extract_text()
                    if pt:
                        text += pt + "\n"
                except Exception as e:
                    errors.append(f"pypdf page {page_num+1}: {e}")

    def _extract_with_pypdf2():
        nonlocal text, page_count
        with open(file_path, 'rb') as f:
            reader = PyPDF2.PdfReader(f)
            page_count = len(reader.pages)
            for page_num, page in enumerate(reader.pages):
                try:
                    pt = page.extract_text()
                    if pt:
                        text += pt + "\n"
                except Exception as e:
                    errors.append(f"PyPDF2 page {page_num+1}: {e}")

    def _extract_with_fitz():
        nonlocal text, page_count
        doc = fitz.open(file_path)
        page_count = doc.page_count
        collected = []
        for page_num in range(page_count):
            try:
                p = doc.load_page(page_num)
                collected.append(p.get_text("text"))
            except Exception as e:
                errors.append(f"fitz page {page_num+1}: {e}")
        text_local = "\n".join([c for c in collected if c])
        return text_local

    # Primary attempt
    try:
        if pypdf:
            chosen_method = "pypdf"
            _extract_with_pypdf()
        elif PyPDF2:
            chosen_method = "pypdf2"
            _extract_with_pypdf2()
        elif fitz:
            chosen_method = "pymupdf"
            text = _extract_with_fitz()
        else:
            chosen_method = "none"
            text = ""
    except Exception as e:
        errors.append(f"primary {chosen_method} error: {e}")
        text = ""

    # Fallback to PyMuPDF if short result
    if fitz and len(text.strip()) < min_chars_threshold:
        try:
            new_text = _extract_with_fitz()
            if len(new_text.strip()) > len(text.strip()):
                text = new_text
                fallback_used = chosen_method != "pymupdf"
                chosen_method = (chosen_method or "") + "+fallback_pymupdf" if chosen_method else "pymupdf"
        except Exception as e:
            errors.append(f"fallback pymupdf error: {e}")

    text = text.strip()
    chars = len(text)
    short_text = chars < min_chars_threshold
    print(f"✅ PDF extraction method={chosen_method} chars={chars} pages={page_count} short={short_text} fallback={fallback_used}")
    if errors:
        print(f"⚠️ PDF extraction warnings: {errors[:3]}{'...' if len(errors)>3 else ''}")
    return {
        "text": text,
        "method": chosen_method,
        "pages": page_count,
        "chars": chars,
        "fallback_used": fallback_used,
        "short_text": short_text,
        "errors": errors
    }

def extract_text_from_pdf(file_path: str) -> str:
    """Backward-compatible simple extractor (returns only text)."""
    info = extract_text_from_pdf_with_diagnostics(file_path)
    return info["text"]

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
