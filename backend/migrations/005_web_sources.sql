-- Migration 005: Web Sources Tables
-- Create tables for managing authorized web sources and their cached content

-- Table for storing allowed web sources (URLs authorized by admins)
CREATE TABLE IF NOT EXISTS allowed_web_sources (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    domain TEXT NOT NULL,
    title TEXT,
    description TEXT,
    source_type VARCHAR(10) CHECK (source_type IN ('html', 'pdf')),
    is_active BOOLEAN DEFAULT TRUE,
    show_to_users BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_fetched TIMESTAMP WITH TIME ZONE,
    fetch_count INTEGER DEFAULT 0
);

CREATE INDEX idx_web_sources_domain ON allowed_web_sources(domain);
CREATE INDEX idx_web_sources_active ON allowed_web_sources(is_active);
CREATE INDEX idx_web_sources_show ON allowed_web_sources(show_to_users);

-- Table for caching fetched web content
CREATE TABLE IF NOT EXISTS web_content_cache (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES allowed_web_sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    content_text TEXT,
    content_markdown TEXT,
    title TEXT,
    metadata JSONB,
    word_count INTEGER,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(source_id)
);

CREATE INDEX idx_web_cache_source ON web_content_cache(source_id);
CREATE INDEX idx_web_cache_expires ON web_content_cache(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_web_sources_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER web_sources_updated_at
    BEFORE UPDATE ON allowed_web_sources
    FOR EACH ROW
    EXECUTE FUNCTION update_web_sources_updated_at();
