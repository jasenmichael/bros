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

export const dockerAppSettings = sqliteTable('app_settings', {
  dockerAppId: text('app_id').primaryKey(),
  autostart: integer('autostart', { mode: 'boolean' }).notNull().default(false),
  navPinned: integer('nav_pinned', { mode: 'boolean' }).notNull().default(false),
  hostMode: text('host_mode').notNull().default('auto'),
  exposeHost: integer('expose_host', { mode: 'boolean' }).notNull().default(true),
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
  tools: integer('tools', { mode: 'boolean' }).notNull().default(false),
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

export const agentProjects = sqliteTable('agent_projects', {
  name: text('name').primaryKey(),
  prBase: text('pr_base').notNull().default('staging'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  fullName: text('full_name'),
  defaultBranch: text('default_branch').notNull().default('main'),
  path: text('path'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  promotionUrl: text('promotion_url'),
})

export const agentJobs = sqliteTable('agent_jobs', {
  id: text('id').primaryKey(),
  project: text('project').notNull(),
  issueNumber: integer('issue_number', { mode: 'number' }).notNull(),
  state: text('state').notNull(),
  kind: text('kind').notNull().default('feat'),
  title: text('title').notNull().default(''),
  branch: text('branch'),
  prNumber: integer('pr_number', { mode: 'number' }),
  prUrl: text('pr_url'),
  taskSpec: text('task_spec'),
  preflightModel: text('preflight_model'),
  error: text('error'),
  result: text('result'),
  agent: text('agent').notNull().default('cursor'),
  retryCount: integer('retry_count', { mode: 'number' }).notNull().default(0),
  branchDeleted: integer('branch_deleted', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  startedAt: integer('started_at', { mode: 'number' }),
  completedAt: integer('completed_at', { mode: 'number' }),
})

export const agentEvents = sqliteTable('agent_events', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  kind: text('kind').notNull(),
  message: text('message').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
})

export const agentApprovals = sqliteTable('agent_approvals', {
  id: text('id').primaryKey(),
  jobId: text('job_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
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
  mkdirSync(join(dataDir, 'var', 'logs'), { recursive: true })
  mkdirSync(join(dataDir, 'var', 'tunnel'), { recursive: true })
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
    CREATE TABLE IF NOT EXISTS app_settings (
      app_id TEXT PRIMARY KEY,
      autostart INTEGER NOT NULL DEFAULT 0,
      nav_pinned INTEGER NOT NULL DEFAULT 0,
      host_mode TEXT NOT NULL DEFAULT 'auto',
      expose_host INTEGER NOT NULL DEFAULT 1
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
    CREATE TABLE IF NOT EXISTS agent_projects (
      name TEXT PRIMARY KEY,
      pr_base TEXT NOT NULL DEFAULT 'staging',
      created_at INTEGER NOT NULL,
      full_name TEXT,
      default_branch TEXT NOT NULL DEFAULT 'main',
      path TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      promotion_url TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_jobs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      issue_number INTEGER NOT NULL,
      state TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'feat',
      title TEXT NOT NULL DEFAULT '',
      branch TEXT,
      pr_number INTEGER,
      pr_url TEXT,
      task_spec TEXT,
      preflight_model TEXT,
      error TEXT,
      result TEXT,
      agent TEXT NOT NULL DEFAULT 'cursor',
      retry_count INTEGER NOT NULL DEFAULT 0,
      branch_deleted INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_approvals (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
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
  const cols = sqlite.prepare('PRAGMA table_info(app_settings)').all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'host_mode')) {
    sqlite.exec(`ALTER TABLE app_settings ADD COLUMN host_mode TEXT NOT NULL DEFAULT 'auto'`)
  }
  if (!cols.some((c) => c.name === 'host_probe_port')) {
    sqlite.exec(`ALTER TABLE app_settings ADD COLUMN host_probe_port INTEGER`)
  }
  if (!cols.some((c) => c.name === 'expose_host')) {
    sqlite.exec(`ALTER TABLE app_settings ADD COLUMN expose_host INTEGER NOT NULL DEFAULT 1`)
  }
  const exposeDefault = sqlite.prepare(`SELECT value FROM meta WHERE key = 'cli_expose_default_on'`).get() as { value: string } | undefined
  if (!exposeDefault) {
    sqlite.exec(`UPDATE app_settings SET expose_host = 1`)
    sqlite.prepare(`INSERT INTO meta (key, value) VALUES ('cli_expose_default_on', '1')`).run()
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
  const convoColsNow = sqlite.prepare('PRAGMA table_info(conversations)').all() as Array<{ name: string }>
  if (!convoColsNow.some((c) => c.name === 'tools')) {
    sqlite.exec(`ALTER TABLE conversations ADD COLUMN tools INTEGER NOT NULL DEFAULT 0`)
    sqlite.exec(`UPDATE conversations SET tools = 1 WHERE kind = 'agent'`)
  }
  const projectCols = sqlite.prepare('PRAGMA table_info(agent_projects)').all() as Array<{ name: string }>
  if (projectCols.length && !projectCols.some((c) => c.name === 'full_name')) {
    sqlite.exec(`ALTER TABLE agent_projects ADD COLUMN full_name TEXT`)
    sqlite.exec(`ALTER TABLE agent_projects ADD COLUMN default_branch TEXT NOT NULL DEFAULT 'main'`)
    sqlite.exec(`ALTER TABLE agent_projects ADD COLUMN path TEXT`)
    sqlite.exec(`ALTER TABLE agent_projects ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1`)
    sqlite.exec(`ALTER TABLE agent_projects ADD COLUMN promotion_url TEXT`)
  }
}
