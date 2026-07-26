-- A restored staging schema may be complete while PostgREST still serves an old schema cache.
-- Keep the reload versioned so bootstrap and role validation only start after the Data API sees it.
notify pgrst, 'reload schema';
