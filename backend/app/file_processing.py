"""
File processing functionality for attachments (PDF, Word, Images)
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

try:
    import pytesseract
except ImportError:
    pytesseract = None

from .auth import get_current_user_optional

router = APIRouter()

class ProcessedFile(BaseModel):
    id: str
    filename: str
    file_type: str
    mime_type: str
    size: int
    content: Optional[str] = None  # Extracted text content
    base64_data: Optional[str] = None  # For images
    processed_at: datetime
    error: Optional[str] = None

class FileUploadResponse(BaseModel):
    success: bool
    files: List[ProcessedFile]
    errors: List[str] = []

# Supported file types
SUPPORTED_EXTENSIONS = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp'
}

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

def extract_text_from_pdf(file_path: str) -> str:
    """Extract text from PDF file"""
    text = ""
    try:
        # Try with pypdf first (newer library)
        if pypdf:
            with open(file_path, 'rb') as file:
                reader = pypdf.PdfReader(file)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        # Fallback to PyPDF2
        elif PyPDF2:
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        else:
            raise Exception("PDF processing libraries not available")
    except Exception as e:
        raise Exception(f"Error extracting text from PDF: {str(e)}")
    
    return text.strip()

def extract_text_from_docx(file_path: str) -> str:
    """Extract text from Word document"""
    if not Document:
        raise Exception("python-docx library not available")
    
    try:
        doc = Document(file_path)
        text = ""
        for paragraph in doc.paragraphs:
            text += paragraph.text + "\n"
        return text.strip()
    except Exception as e:
        raise Exception(f"Error extracting text from Word document: {str(e)}")

def process_image(file_path: str, filename: str) -> Dict[str, Any]:
    """Process image file - convert to base64 and optionally extract text with OCR"""
    try:
        # Convert image to base64 for AI models
        with open(file_path, 'rb') as image_file:
            base64_data = base64.b64encode(image_file.read()).decode('utf-8')
        
        result = {
            'base64_data': base64_data,
            'content': None
        }
        
        # Try OCR if pytesseract is available
        if pytesseract:
            try:
                image = Image.open(file_path)
                extracted_text = pytesseract.image_to_string(image)
                if extracted_text.strip():
                    result['content'] = f"[OCR Text from {filename}]:\n{extracted_text.strip()}"
            except Exception as ocr_error:
                print(f"OCR failed for {filename}: {ocr_error}")
        
        return result
    except Exception as e:
        raise Exception(f"Error processing image: {str(e)}")

async def process_uploaded_file(upload_file: UploadFile) -> ProcessedFile:
    """Process a single uploaded file"""
    file_id = str(uuid.uuid4())
    
    # Validate file size
    if upload_file.size and upload_file.size > MAX_FILE_SIZE:
        raise Exception(f"File too large: {upload_file.size} bytes (max: {MAX_FILE_SIZE})")
    
    # Get file extension and mime type
    filename = upload_file.filename or "unknown"
    file_ext = filename.split('.')[-1].lower() if '.' in filename else ''
    
    if file_ext not in SUPPORTED_EXTENSIONS:
        raise Exception(f"Unsupported file type: {file_ext}")
    
    expected_mime = SUPPORTED_EXTENSIONS[file_ext]
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp_file:
        content = await upload_file.read()
        temp_file.write(content)
        temp_file_path = temp_file.name
    
    try:
        processed_file = ProcessedFile(
            id=file_id,
            filename=filename,
            file_type=file_ext,
            mime_type=upload_file.content_type or expected_mime,
            size=len(content),
            processed_at=datetime.now()
        )
        
        # Process based on file type
        if file_ext == 'pdf':
            text_content = extract_text_from_pdf(temp_file_path)
            processed_file.content = text_content
            
        elif file_ext in ['docx', 'doc']:
            text_content = extract_text_from_docx(temp_file_path)
            processed_file.content = text_content
            
        elif file_ext in ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']:
            image_result = process_image(temp_file_path, filename)
            processed_file.base64_data = image_result['base64_data']
            processed_file.content = image_result['content']
        
        return processed_file
        
    finally:
        # Clean up temporary file
        try:
            os.unlink(temp_file_path)
        except:
            pass

@router.post("/file-upload", response_model=FileUploadResponse)
async def upload_files(
    files: List[UploadFile] = File(...),
    current_user = Depends(get_current_user_optional)
):
    """Upload and process multiple files"""
    
    if len(files) > 5:  # Limit number of files
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 files allowed per upload"
        )
    
    processed_files = []
    errors = []
    
    for upload_file in files:
        try:
            processed_file = await process_uploaded_file(upload_file)
            processed_files.append(processed_file)
            print(f"✅ Processed file: {upload_file.filename} ({processed_file.file_type})")
            
        except Exception as e:
            error_msg = f"Error processing {upload_file.filename}: {str(e)}"
            errors.append(error_msg)
            print(f"❌ {error_msg}")
    
    return FileUploadResponse(
        success=len(processed_files) > 0,
        files=processed_files,
        errors=errors
    )

@router.get("/file-upload/supported-types")
async def get_supported_file_types():
    """Get list of supported file types"""
    return {
        "supported_extensions": list(SUPPORTED_EXTENSIONS.keys()),
        "mime_types": SUPPORTED_EXTENSIONS,
        "max_file_size": MAX_FILE_SIZE,
        "max_files_per_upload": 5
    }
