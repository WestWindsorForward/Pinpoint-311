-- PostGIS Enhancement Migration
-- Ensures location geometry is populated and trigger exists

-- 1. Enable PostGIS extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Populate location column for existing records
UPDATE service_requests 
SET location = ST_SetSRID(ST_MakePoint(long, lat), 4326)
WHERE lat IS NOT NULL 
  AND long IS NOT NULL 
  AND location IS NULL;

-- 3. Create trigger function to auto-populate location on new records
CREATE OR REPLACE FUNCTION update_location_geometry()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.lat IS NOT NULL AND NEW.long IS NOT NULL THEN
        NEW.location := ST_SetSRID(ST_MakePoint(NEW.long, NEW.lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS set_location_geometry ON service_requests;
CREATE TRIGGER set_location_geometry
    BEFORE INSERT OR UPDATE ON service_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_location_geometry();

-- Verification: Check that location column is populated
-- SELECT COUNT(*) as total, COUNT(location) as with_location FROM service_requests;
