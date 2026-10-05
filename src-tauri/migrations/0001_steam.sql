CREATE TABLE recent_items (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('song','game','post','novel','comic')),
  source_id TEXT NOT NULL,
  title TEXT NOT NULL,
  cover TEXT,
  target TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  UNIQUE(type, source_id)
);
CREATE INDEX recent_items_viewed_at_idx ON recent_items(viewed_at DESC);
CREATE INDEX recent_items_type_viewed_at_idx ON recent_items(type,viewed_at DESC);
CREATE TABLE remote_cache (
  cache_key TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
);
CREATE INDEX remote_cache_last_accessed_idx ON remote_cache(last_accessed_at);
