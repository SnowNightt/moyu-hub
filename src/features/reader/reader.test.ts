import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { completion } from './position';

describe('reader persistence', () => {
  function database() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    db.exec(readFileSync('src-tauri/migrations/0001_steam.sql', 'utf8'));
    db.exec(readFileSync('src-tauri/migrations/0002_reader.sql', 'utf8'));
    db.prepare('INSERT INTO library_items VALUES(?,?,?,?,?,?,?,?,?)').run(
      'book',
      'TXT',
      'hash',
      'C:/book.txt',
      'reference',
      'stamp',
      'UTF-8',
      '{}',
      1,
    );
    return db;
  }
  it('clearing history and remote cache preserves reading positions and bookmarks', () => {
    const db = database();
    db.prepare('INSERT INTO reading_progress VALUES(?,?,?,?)').run(
      'book',
      '{"position":0.5}',
      2,
      1,
    );
    db.prepare('INSERT INTO bookmarks VALUES(?,?,?,?)').run('mark', 'book', 'loc', '{}');
    db.exec('UPDATE reading_progress SET history_visible=0; DELETE FROM remote_cache;');
    expect(db.prepare('SELECT data FROM reading_progress').get()?.data).toContain('0.5');
    expect(db.prepare('SELECT count(*) AS n FROM bookmarks').get()?.n).toBe(1);
    db.exec("DELETE FROM library_items WHERE id='book'");
    expect(db.prepare('SELECT count(*) AS n FROM reading_progress').get()?.n).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM bookmarks').get()?.n).toBe(0);
    db.close();
  });
  it('enforces duplicate fingerprints and rolls back an incomplete import', () => {
    const db = database();
    expect(() =>
      db
        .prepare('INSERT INTO library_items VALUES(?,?,?,?,?,?,?,?,?)')
        .run('other', 'TXT', 'hash', 'x', 'reference', 's', null, '{}', 2),
    ).toThrow();
    db.exec('BEGIN');
    db.prepare('INSERT INTO reader_chapters VALUES(?,?,?,?)').run('c0', 'book', 0, '{}');
    expect(() =>
      db.prepare('INSERT INTO reader_chapters VALUES(?,?,?,?)').run('c1', 'book', 0, '{}'),
    ).toThrow();
    db.exec('ROLLBACK');
    expect(db.prepare('SELECT count(*) AS n FROM reader_chapters').get()?.n).toBe(0);
    db.close();
  });
  it('weights progress by content length, not number of chapters', () => {
    const chapters = [
      { id: 'a', title: 'a', index: 0, units: 100 },
      { id: 'b', title: 'b', index: 1, units: 900 },
    ];
    expect(completion(chapters, 1, 0)).toBe(0.1);
    expect(completion(chapters, 1, 1)).toBe(1);
  });
});
