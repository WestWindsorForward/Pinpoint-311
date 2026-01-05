-- Migration: Add manual_priority_score column to service_requests table
-- This column stores human-overridden priority scores (1-10) that take precedence over AI-generated scores

ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS manual_priority_score FLOAT;

-- Add an index for faster sorting by priority
CREATE INDEX IF NOT EXISTS idx_service_requests_manual_priority ON service_requests(manual_priority_score) WHERE manual_priority_score IS NOT NULL;
