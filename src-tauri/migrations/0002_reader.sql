CREATE TABLE library_items (
 id TEXT PRIMARY KEY NOT NULL,
 format TEXT NOT NULL CHECK(format IN ('TXT','EPUB','CBZ','folder')),
 fingerprint TEXT NOT NULL,
 source_path TEXT NOT NULL,
 storage_mode TEXT NOT NULL CHECK(storage_mode IN ('reference','copy')),
 source_stamp TEXT NOT NULL,
 encoding TEXT,
 data TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(format,fingerprint)
);
CREATE TABLE reader_chapters (
 id TEXT NOT NULL,
 item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL,
 data TEXT NOT NULL,
 PRIMARY KEY(item_id,id), UNIQUE(item_id,ordinal)
);
CREATE TABLE reader_resources (
 id TEXT NOT NULL,
 item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
 data TEXT NOT NULL,
 PRIMARY KEY(item_id,id)
);
CREATE TABLE reading_progress (
 item_id TEXT PRIMARY KEY NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
 data TEXT NOT NULL,
 last_read_at INTEGER NOT NULL,
 history_visible INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX reader_history_idx ON reading_progress(history_visible,last_read_at DESC);
CREATE TABLE bookmarks (
 id TEXT PRIMARY KEY NOT NULL,
 item_id TEXT NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
 locator TEXT NOT NULL,
 data TEXT NOT NULL,
 UNIQUE(item_id,locator)
);
