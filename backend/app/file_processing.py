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
