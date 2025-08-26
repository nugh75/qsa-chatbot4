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
    import fitz  # PyMuPDF for image extraction from PDFs
except ImportError:
    fitz = None

try:
    from docx import Document
except ImportError:
    Document = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

from .auth import get_current_active_user
from .llm import chat_with_provider
from typing import Union

router = APIRouter()

class ProcessedFile(BaseModel):
    id: str
    filename: str
    file_type: str
    mime_type: str
    size: int
    content: Optional[str] = None  # Extracted text content
    base64_data: Optional[str] = None  # For images
    images: Optional[List[Dict[str, Any]]] = None  # Extracted images from PDFs with descriptions
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
        print(f"🔍 Attempting to extract text from PDF: {file_path}")
        print(f"🔍 pypdf available: {pypdf is not None}")
        print(f"🔍 PyPDF2 available: {PyPDF2 is not None}")
        
        # Try with pypdf first (newer library)
        if pypdf:
            print("📚 Using pypdf library")
            with open(file_path, 'rb') as file:
                reader = pypdf.PdfReader(file)
                print(f"📄 PDF has {len(reader.pages)} pages")
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        # Fallback to PyPDF2
        elif PyPDF2:
            print("📚 Using PyPDF2 library")
            with open(file_path, 'rb') as file:
                reader = PyPDF2.PdfReader(file)
                print(f"📄 PDF has {len(reader.pages)} pages")
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        else:
            raise Exception("PDF processing libraries not available")
    except Exception as e:
        print(f"❌ Error in extract_text_from_pdf: {str(e)}")
        raise Exception(f"Error extracting text from PDF: {str(e)}")
    
    print(f"✅ Extracted {len(text)} characters from PDF")
    return text.strip()

async def extract_images_from_pdf(file_path: str, filename: str) -> List[Dict[str, Any]]:
    """Extract images from PDF and get descriptions using GPT-4o mini"""
    images = []
    
    if not fitz:
        print("PyMuPDF not available - skipping image extraction")
        return images
    
    try:
        doc = fitz.open(file_path)
        
        for page_num in range(doc.page_count):
            page = doc[page_num]
            image_list = page.get_images()
            
            for img_index, img in enumerate(image_list):
                try:
                    # Get image data
                    xref = img[0]
                    base_image = doc.extract_image(xref)
                    image_bytes = base_image["image"]
                    image_ext = base_image["ext"]
                    
                    # Convert to base64
                    base64_data = base64.b64encode(image_bytes).decode('utf-8')
                    
                    # Get description from GPT-4o mini
                    description = await get_image_description(base64_data, image_ext)
                    
                    images.append({
                        "page": page_num + 1,
                        "index": img_index,
                        "base64_data": base64_data,
                        "format": image_ext,
                        "description": description,
                        "source": f"Page {page_num + 1} of {filename}"
                    })
                    
                    print(f"✅ Extracted image {img_index + 1} from page {page_num + 1}")
                    
                except Exception as img_error:
                    print(f"❌ Error extracting image {img_index} from page {page_num + 1}: {img_error}")
                    continue
        
        doc.close()
        
    except Exception as e:
        print(f"❌ Error extracting images from PDF: {e}")
    
    return images

async def get_image_description(base64_data: str, image_format: str) -> str:
    """Get image description using GPT-4o mini vision with direct OpenAI API call"""
    try:
        # Use OpenAI Responses API directly for better vision support
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return "OpenAI API key non disponibile"
        
        print(f"🤖 Sending image to GPT-4o mini vision API")
        print(f"🔍 Image format: {image_format}")
        print(f"🔍 Base64 data length: {len(base64_data)} chars")
        
        # Prepare the request for OpenAI Responses API
        payload = {
            "model": "gpt-4o-mini",
            "input": [{
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": """Analizza questa immagine e rispondi SOLO con quello che ti viene richiesto:

1. Se l'immagine contiene TABELLE con dati:
   - Estrai SOLO i valori/numeri dalla tabella
   - NON includere descrizioni, formattazione o altro testo
   - Formato: numeri separati da spazi o virgole
   - Esempio: "8 3" oppure "1, 7, 4"

2. Se l'immagine NON contiene tabelle ma ha contenuto testuale:
   - Estrai SOLO il testo leggibile
   - NON dare descrizioni dell'immagine

3. Se l'immagine è vuota o non ha contenuto utile:
   - Rispondi: "VUOTA"

IMPORTANTE: Non aggiungere spiegazioni, descrizioni o commenti. Solo i dati richiesti."""
                    },
                    {
                        "type": "input_image",
                        "image_url": f"data:image/{image_format};base64,{base64_data}"
                    }
                ]
            }]
        }
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/responses",
                headers=headers,
                json=payload
            )
        
        if response.status_code != 200:
            print(f"❌ OpenAI API error: {response.status_code} - {response.text}")
            return f"Errore API OpenAI: {response.status_code}"
        
        result = response.json()
        
        # Extract ONLY the text content from the response
        if "output" in result and result["output"]:
            output = result["output"]
            if isinstance(output, list) and len(output) > 0:
                # Get the first message content
                message = output[0]
                if isinstance(message, dict) and "content" in message:
                    content_list = message["content"]
                    if isinstance(content_list, list) and len(content_list) > 0:
                        text_content = content_list[0]
                        if isinstance(text_content, dict) and "text" in text_content:
                            clean_text = text_content["text"].strip()
                            print(f"✅ Extracted clean text: '{clean_text}'")
                            return clean_text
            
            # Fallback for other formats
            if isinstance(output, str):
                clean_text = output.strip()
                print(f"✅ Extracted clean text: '{clean_text}'")
                return clean_text
        
        print(f"❌ Could not extract text from response: {result}")
        return "ERRORE"
        
    except Exception as e:
        print(f"❌ Error getting image description from GPT-4o mini: {e}")
        return f"Errore nella descrizione dell'immagine: {str(e)}"

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
    
    print(f"🔍 Processing file: {upload_file.filename}")
    print(f"🔍 Content type: {upload_file.content_type}")
    print(f"🔍 File size: {upload_file.size}")
    
    # Validate file size
    if upload_file.size and upload_file.size > MAX_FILE_SIZE:
        raise Exception(f"File too large: {upload_file.size} bytes (max: {MAX_FILE_SIZE})")
    
    # Get file extension and mime type
    filename = upload_file.filename or "unknown"
    file_ext = filename.split('.')[-1].lower() if '.' in filename else ''
    
    print(f"🔍 File extension: {file_ext}")
    
    if file_ext not in SUPPORTED_EXTENSIONS:
        raise Exception(f"Unsupported file type: {file_ext}")
    
    expected_mime = SUPPORTED_EXTENSIONS[file_ext]
    
    # Create temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{file_ext}") as temp_file:
        content = await upload_file.read()
        temp_file.write(content)
        temp_file_path = temp_file.name
    
    print(f"🔍 Temporary file created: {temp_file_path}")
    
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
            print(f"📄 Processing PDF file: {filename}")
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
    files: List[UploadFile] = File(...)
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
