"""
API routes for web sources management
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, HttpUrl
from typing import List, Optional, Dict, Any
from datetime import datetime

from .auth import get_current_admin_user, get_current_active_user
from . import web_sources

router = APIRouter(prefix="/admin/web-sources", tags=["web-sources"])

# Pydantic models for request/response

class WebSourceCreate(BaseModel):
    url: str
    description: Optional[str] = ""
    is_active: bool = True
    show_to_users: bool = True

class WebSourceUpdate(BaseModel):
    url: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    show_to_users: Optional[bool] = None

class WebSourceResponse(BaseModel):
    id: int
    url: str
    domain: str
    title: Optional[str]
    description: Optional[str]
    source_type: str
    is_active: bool
    show_to_users: bool
    created_at: str
    updated_at: str
    last_fetched: Optional[str]
    fetch_count: int

class WebContentResponse(BaseModel):
    content_text: str
    content_markdown: str
    title: str
    metadata: Dict[str, Any]
    word_count: int

class SearchResult(BaseModel):
    source_id: int
    url: str
    source_title: Optional[str]
    title: str
    snippet: str
    word_count: int
    show_to_users: bool


# Admin endpoints

@router.get("/", response_model=Dict[str, Any])
async def list_web_sources(
    active_only: bool = Query(False, description="Filter active sources only"),
    current_user: dict = Depends(get_current_admin_user)
):
    """
    List all web sources (admin only)
    Returns list of sources with metadata
    """
    try:
        sources = web_sources.get_web_sources(active_only=active_only)

        return {
            "success": True,
            "sources": sources,
            "total": len(sources)
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching web sources: {str(e)}"
        )


@router.post("/", response_model=Dict[str, Any])
async def create_web_source(
    source_data: WebSourceCreate,
    fetch_now: bool = Query(False, description="Fetch content immediately"),
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Create new web source (admin only)
    Optionally fetch and cache content immediately
    """
    try:
        # Validate URL
        if not web_sources.validate_url(source_data.url):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid URL format"
            )

        # Create source
        source = web_sources.create_web_source(
            url=source_data.url,
            description=source_data.description or "",
            created_by=current_user['id'],
            is_active=source_data.is_active,
            show_to_users=source_data.show_to_users
        )

        if not source:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create web source"
            )

        # Optionally fetch content now
        content = None
        if fetch_now:
            try:
                content = await web_sources.fetch_and_cache_source(source['id'])
            except web_sources.WebSourceError as e:
                # Source created but fetch failed - return warning
                return {
                    "success": True,
                    "source": source,
                    "warning": f"Source created but fetch failed: {str(e)}"
                }

        return {
            "success": True,
            "source": source,
            "content": content if content else None
        }

    except web_sources.WebSourceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating web source: {str(e)}"
        )


@router.get("/{source_id}", response_model=Dict[str, Any])
async def get_web_source(
    source_id: int,
    include_cache: bool = Query(False, description="Include cached content"),
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Get specific web source by ID (admin only)
    """
    try:
        source = web_sources.get_web_source_by_id(source_id)

        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Web source {source_id} not found"
            )

        result = {
            "success": True,
            "source": source
        }

        # Include cached content if requested
        if include_cache:
            cached = web_sources.get_cached_content(source_id)
            result["cache"] = cached

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching web source: {str(e)}"
        )


@router.put("/{source_id}", response_model=Dict[str, Any])
async def update_web_source(
    source_id: int,
    source_data: WebSourceUpdate,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Update web source (admin only)
    """
    try:
        # Check source exists
        source = web_sources.get_web_source_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Web source {source_id} not found"
            )

        # Update
        updates = source_data.dict(exclude_unset=True)

        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )

        success = web_sources.update_web_source(source_id, **updates)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update web source"
            )

        # Get updated source
        updated_source = web_sources.get_web_source_by_id(source_id)

        return {
            "success": True,
            "source": updated_source
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating web source: {str(e)}"
        )


@router.delete("/{source_id}", response_model=Dict[str, Any])
async def delete_web_source(
    source_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Delete web source and its cache (admin only)
    """
    try:
        # Check source exists
        source = web_sources.get_web_source_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Web source {source_id} not found"
            )

        # Delete
        success = web_sources.delete_web_source(source_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to delete web source"
            )

        return {
            "success": True,
            "message": f"Web source {source_id} deleted"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting web source: {str(e)}"
        )


@router.post("/{source_id}/fetch", response_model=Dict[str, Any])
async def fetch_source_content(
    source_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Fetch/refresh content from source URL (admin only)
    """
    try:
        # Check source exists
        source = web_sources.get_web_source_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Web source {source_id} not found"
            )

        # Fetch and cache
        content = await web_sources.fetch_and_cache_source(source_id)

        return {
            "success": True,
            "content": content,
            "message": "Content fetched and cached successfully"
        }

    except web_sources.WebSourceError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching content: {str(e)}"
        )


@router.post("/{source_id}/toggle", response_model=Dict[str, Any])
async def toggle_source_active(
    source_id: int,
    current_user: dict = Depends(get_current_admin_user)
):
    """
    Toggle source active status (admin only)
    """
    try:
        source = web_sources.get_web_source_by_id(source_id)
        if not source:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Web source {source_id} not found"
            )

        new_status = not source['is_active']
        web_sources.update_web_source(source_id, is_active=new_status)

        return {
            "success": True,
            "is_active": new_status
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error toggling source: {str(e)}"
        )


# Search endpoint for chat integration (available to all authenticated users)
search_router = APIRouter(prefix="/web-search", tags=["web-search"])

@search_router.post("/", response_model=Dict[str, Any])
async def search_web_content(
    query: str = Query(..., description="Search query"),
    max_results: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Search in cached web content
    Available to all authenticated users
    """
    try:
        if not query or len(query.strip()) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Query too short (minimum 2 characters)"
            )

        results = web_sources.search_in_cached_content(query, limit=max_results)

        return {
            "success": True,
            "query": query,
            "results": results,
            "count": len(results)
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error searching content: {str(e)}"
        )


@search_router.get("/visible-sources", response_model=Dict[str, Any])
async def get_visible_sources(
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get web sources visible to users
    Available to all authenticated users
    """
    try:
        sources = web_sources.get_web_sources(active_only=True, visible_only=True)

        # Remove sensitive fields
        safe_sources = []
        for source in sources:
            safe_sources.append({
                'id': source['id'],
                'url': source['url'],
                'domain': source['domain'],
                'title': source.get('title'),
                'description': source.get('description'),
                'source_type': source['source_type']
            })

        return {
            "success": True,
            "sources": safe_sources,
            "count": len(safe_sources)
        }

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching sources: {str(e)}"
        )
