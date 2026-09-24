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
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(false),
  configJson: text('config_json'),
})

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  modelId: text('model_id').notNull(),
  kind: text('kind').notNull().default('chat'), // chat | agent
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
})

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  modelId: text('model_id'),
  durationMs: integer('duration_ms', { mode: 'number' }),
  promptTokens: integer('prompt_tokens', { mode: 'number' }),
  completionTokens: integer('completion_tokens', { mode: 'number' }),
  traceJson: text('trace_json'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const ollamaPullJobRows = sqliteTable('ollama_pull_jobs', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  model: text('model').notNull(),
  status: text('status').notNull(),
  percent: integer('percent', { mode: 'number' }),
  completed: integer('completed', { mode: 'number' }).notNull(),
  total: integer('total', { mode: 'number' }).notNull(),
  error: text('error'),
  phase: text('phase').notNull(),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
})

let _db: ReturnType<typeof drizzle> | null = null
let _sqlite: Database.Database | null = null

export function getDb() {
  if (_db) return _db
  const { dataDir } = loadBootstrapConfig()
  mkdirSync(dataDir, { recursive: true })
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
      enabled INTEGER NOT NULL DEFAULT 0,
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
    CREATE TABLE IF NOT EXISTS ollama_pull_jobs (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model TEXT NOT NULL,
      status TEXT NOT NULL,
      percent INTEGER,
      completed INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      phase TEXT NOT NULL,
      started_at INTEGER NOT NULL
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
  if (!msgCols.some((c) => c.name === 'duration_ms')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN duration_ms INTEGER`)
  }
  if (!msgCols.some((c) => c.name === 'prompt_tokens')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER`)
  }
  if (!msgCols.some((c) => c.name === 'completion_tokens')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN completion_tokens INTEGER`)
  }
  if (!msgCols.some((c) => c.name === 'trace_json')) {
    sqlite.exec(`ALTER TABLE messages ADD COLUMN trace_json TEXT`)
  }
  const convoCols = sqlite.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
  if (!convoCols.some((c) => c.name === 'kind')) {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'`)
  }
}
