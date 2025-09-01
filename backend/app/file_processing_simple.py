"""
File processing functionality for attachments (PDF, Word, Images) - Simplified version without image extraction
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
import os
import tempfile
import uuid
from datetime import datetime
import base64
import mimetypes
import httpx
from PIL import Image
import io

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
    filename: str
    content: str
    file_type: str
    base64_data: Optional[str] = None
    mime_type: Optional[str] = None
    size: Optional[int] = None
    processed_at: Optional[datetime] = None

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
                print(f"  PDF has {len(reader.pages)} pages")
                
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
                print(f"  PDF has {len(reader.pages)} pages")
                
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

def process_image(file_path: str, filename: str) -> Dict[str, Any]:
    """Process image file and convert to base64"""
    try:
        with open(file_path, 'rb') as image_file:
            image_data = image_file.read()
            base64_data = base64.b64encode(image_data).decode('utf-8')
            
            # Get image dimensions
            try:
                with Image.open(file_path) as img:
                    width, height = img.size
                    mode = img.mode
                    content = f"Immagine: {filename}\nDimensioni: {width}x{height} pixels\nModalità: {mode}"
            except Exception as e:
                content = f"Immagine: {filename}\nErrore nel caricamento delle informazioni: {str(e)}"
            
            return {
                'base64_data': base64_data,
                'content': content
            }
    except Exception as e:
        return {
            'base64_data': None,
            'content': f"Errore nel processamento dell'immagine: {str(e)}"
        }

# Create router
router = APIRouter()

@router.post("/upload", response_model=List[ProcessedFile])
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
                filename=filename,
                content="",
                file_type=file_ext,
                mime_type=upload_file.content_type or expected_mime,
                size=len(content),
                processed_at=datetime.now()
            )
            
            # Process based on file type - ONLY TEXT EXTRACTION
            if file_ext == 'pdf':
                print(f"  Processing PDF file: {filename}")
                text_content = extract_text_from_pdf(temp_file_path)
                processed_file.content = text_content
                
            elif file_ext in ['docx', 'doc']:
                text_content = extract_text_from_docx(temp_file_path)
                processed_file.content = text_content
                
            elif file_ext in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']:
                image_result = process_image(temp_file_path, filename)
                processed_file.base64_data = image_result['base64_data']
                processed_file.content = image_result['content']
                
            else:
                # For other file types, try to read as text
                try:
                    with open(temp_file_path, 'r', encoding='utf-8') as f:
                        processed_file.content = f.read()
                except UnicodeDecodeError:
                    try:
                        with open(temp_file_path, 'r', encoding='latin-1') as f:
                            processed_file.content = f.read()
                    except Exception as e:
                        processed_file.content = f"Impossibile leggere il file come testo: {str(e)}"
            
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
                filename=upload_file.filename or "unknown",
                content=f"Errore nel processamento del file: {str(e)}",
                file_type="error",
                processed_at=datetime.now()
            ))
    
    return processed_files

@router.get("/supported-types")
async def get_supported_types():
    """Get list of supported file types"""
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
                "extension": "png",
                "description": "PNG Image",
                "mime_types": ["image/png"]
            },
            {
                "extension": "jpg",
                "description": "JPEG Image",
                "mime_types": ["image/jpeg"]
            },
            {
                "extension": "jpeg",
                "description": "JPEG Image",
                "mime_types": ["image/jpeg"]
            },
            {
                "extension": "gif",
                "description": "GIF Image",
                "mime_types": ["image/gif"]
            },
            {
                "extension": "webp",
                "description": "WebP Image",
                "mime_types": ["image/webp"]
            }
        ]
    }
