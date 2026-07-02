import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'

let db: Database | null = null

/** Lazily open (and migrate) the SauceControl SQLite database. */
export function getDb(): Database {
  if (db) return db

  const dir = join(homedir(), '.sauce-ctrl')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'sauce-ctrl.sqlite')

  db = new Database(file, { create: true })
  db.exec('PRAGMA journal_mode = WAL;')
  db.exec('PRAGMA foreign_keys = ON;')

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      path        TEXT NOT NULL UNIQUE,
      added_at    INTEGER NOT NULL,
      last_opened INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cache (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      expires_at INTEGER
    );
  `)

  return db
}

export interface ProjectRow {
  id: string
  name: string
  path: string
  added_at: number
  last_opened: number | null
}

export function listProjects(): ProjectRow[] {
  return getDb().query('SELECT * FROM projects ORDER BY last_opened DESC, added_at DESC').all() as ProjectRow[]
}

export function addProject(row: ProjectRow) {
  getDb()
    .query(
      'INSERT INTO projects (id, name, path, added_at, last_opened) VALUES ($id, $name, $path, $added_at, $last_opened) ON CONFLICT(path) DO UPDATE SET name = $name, last_opened = $last_opened',
    )
    .run({
      $id: row.id,
      $name: row.name,
      $path: row.path,
      $added_at: row.added_at,
      $last_opened: row.last_opened,
    })
}

export function removeProject(id: string) {
  getDb().query('DELETE FROM projects WHERE id = $id').run({ $id: id })
}

export function touchProject(id: string) {
  getDb().query('UPDATE projects SET last_opened = $t WHERE id = $id').run({ $t: Date.now(), $id: id })
}

export function getSetting(key: string): string | null {
  const row = getDb().query('SELECT value FROM settings WHERE key = $k').get({ $k: key }) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string) {
  getDb()
    .query('INSERT INTO settings (key, value) VALUES ($k, $v) ON CONFLICT(key) DO UPDATE SET value = $v')
    .run({ $k: key, $v: value })
}

export function getCache<T = unknown>(key: string): T | null {
  const row = getDb().query('SELECT value, expires_at FROM cache WHERE key = $k').get({ $k: key }) as
    | { value: string; expires_at: number | null }
    | undefined
  if (!row) return null
  if (row.expires_at && row.expires_at < Date.now()) {
    getDb().query('DELETE FROM cache WHERE key = $k').run({ $k: key })
    return null
  }
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

export function setCache(key: string, value: unknown, ttlMs?: number) {
  getDb()
    .query(
      'INSERT INTO cache (key, value, expires_at) VALUES ($k, $v, $e) ON CONFLICT(key) DO UPDATE SET value = $v, expires_at = $e',
    )
    .run({ $k: key, $v: JSON.stringify(value), $e: ttlMs ? Date.now() + ttlMs : null })
}
