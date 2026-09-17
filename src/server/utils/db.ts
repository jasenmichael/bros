import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadBootstrapConfig } from './config'

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
})

export const sidecarSettings = sqliteTable('sidecar_settings', {
  sidecarId: text('sidecar_id').primaryKey(),
  autostart: integer('autostart', { mode: 'boolean' }).notNull().default(false),
  navPinned: integer('nav_pinned', { mode: 'boolean' }).notNull().default(false),
  hostMode: text('host_mode').notNull().default('auto'),
  hostProbePort: integer('host_probe_port', { mode: 'number' }),
})

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(), // ollama | openai | anthropic
  baseUrl: text('base_url'),
  apiKeyEnc: text('api_key_enc'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  configJson: text('config_json'),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  modelId: text('model_id'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: Database.Database | null = null

export function getDb() {
  if (_db) return _db
  const { dataDir } = loadBootstrapConfig()
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(join(dataDir, 'sidecars'), { recursive: true })
  mkdirSync(join(dataDir, 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'tunnel'), { recursive: true })
  const dbPath = join(dataDir, 'bros.sqlite')
  _sqlite = new Database(dbPath)
  _sqlite.pragma('journal_mode = WAL')
  _db = drizzle(_sqlite)
  migrate(_sqlite)
  return _db
}

/** Close singleton DB so tests can switch BROS_DATA_DIR. */
export function resetDbForTests() {
  try {
    _sqlite?.close()
  } catch {
    // ignore
  }
  _sqlite = null
  _db = null
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sidecar_settings (
      sidecar_id TEXT PRIMARY KEY,
      autostart INTEGER NOT NULL DEFAULT 0,
      nav_pinned INTEGER NOT NULL DEFAULT 0,
      host_mode TEXT NOT NULL DEFAULT 'auto'
    );
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      base_url TEXT,
      api_key_enc TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
  const cols = sqlite.prepare('PRAGMA table_info(sidecar_settings)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'host_mode')) {
    sqlite.exec(`ALTER TABLE sidecar_settings ADD COLUMN host_mode TEXT NOT NULL DEFAULT 'auto'`)
  }
  if (!cols.some((c) => c.name === 'host_probe_port')) {
    sqlite.exec(`ALTER TABLE sidecar_settings ADD COLUMN host_probe_port INTEGER`)
  }
  const msgCols = sqlite.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
  if (!msgCols.some((c) => c.name === 'model_id')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN model_id TEXT`)
  }
}
