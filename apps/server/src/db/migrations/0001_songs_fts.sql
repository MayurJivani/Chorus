-- FTS5 virtual table for guess autocomplete. Drizzle's schema DSL can't declare
-- virtual tables, so this is a hand-written migration kept in sync with `songs`
-- via triggers (content='songs' means songs_fts stores no data of its own).
CREATE VIRTUAL TABLE songs_fts USING fts5(
  title,
  artist,
  content = 'songs',
  content_rowid = 'id'
);
--> statement-breakpoint
CREATE TRIGGER songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO songs_fts(rowid, title, artist) VALUES (new.id, new.title, new.artist);
END;
--> statement-breakpoint
CREATE TRIGGER songs_ad AFTER DELETE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, artist) VALUES ('delete', old.id, old.title, old.artist);
END;
--> statement-breakpoint
CREATE TRIGGER songs_au AFTER UPDATE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts, rowid, title, artist) VALUES ('delete', old.id, old.title, old.artist);
  INSERT INTO songs_fts(rowid, title, artist) VALUES (new.id, new.title, new.artist);
END;
