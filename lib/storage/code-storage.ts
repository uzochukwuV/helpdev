// src/lib/db.ts
import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';


// Type definitions
export interface CodeSnippet {
  id: string;
  content: string;
  language: string;
  tags: string[];
  filePath?: string;
  projectContext?: string;
  timestamp: string;
  sourceApp: string;
  favorited?: boolean;
}

export interface ErrorPattern {
  id: string;
  errorText: string;
  solution: string;
  language: string;
  frequency: number;
  lastEncountered: string;
}

export interface DeveloperContext {
  currentApp: string;
  activeFile?: string;
  projectRoot?: string;
  lastActivity: string;
}

// Database connection singleton
let db: Database<sqlite3.Database, sqlite3.Statement>;

async function getDb() {
  if (!db) {
    db = await open({
      filename: './dev-assistant.db',
      driver: sqlite3.Database
    });

    await db.exec(`
      CREATE TABLE IF NOT EXISTS snippets (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        language TEXT NOT NULL,
        tags TEXT, -- JSON array
        filePath TEXT,
        projectContext TEXT,
        timestamp TEXT NOT NULL,
        sourceApp TEXT NOT NULL,
        favorited INTEGER DEFAULT 0
      );
      
      CREATE TABLE IF NOT EXISTS error_patterns (
        id TEXT PRIMARY KEY,
        errorText TEXT NOT NULL,
        solution TEXT NOT NULL,
        language TEXT NOT NULL,
        frequency INTEGER DEFAULT 1,
        lastEncountered TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS developer_context (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        currentApp TEXT NOT NULL,
        activeFile TEXT,
        projectRoot TEXT,
        lastActivity TEXT NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_snippets_language ON snippets(language);
      CREATE INDEX IF NOT EXISTS idx_snippets_tags ON snippets(tags);
      CREATE INDEX IF NOT EXISTS idx_errors_language ON error_patterns(language);
    `);
  }
  return db;
}

// Snippet Operations
export async function saveSnippet(snippet: Omit<CodeSnippet, 'id' | 'timestamp'>): Promise<CodeSnippet> {
  const db = await getDb();
  const fullSnippet: CodeSnippet = {
    ...snippet,
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    favorited: snippet.favorited || false
  };

  await db.run(
    `INSERT INTO snippets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    fullSnippet.id,
    fullSnippet.content,
    fullSnippet.language,
    JSON.stringify(fullSnippet.tags || []),
    fullSnippet.filePath,
    fullSnippet.projectContext,
    fullSnippet.timestamp,
    fullSnippet.sourceApp,
    fullSnippet.favorited ? 1 : 0
  );

  return fullSnippet;
}

export async function getSnippets(options: {
  language?: string;
  searchTerm?: string;
  limit?: number;
} = {}): Promise<CodeSnippet[]> {
  const db = await getDb();
  let query = 'SELECT * FROM snippets';
  const params: any[] = [];
  
  if (options.language || options.searchTerm) {
    const conditions = [];
    if (options.language) {
      conditions.push('language = ?');
      params.push(options.language);
    }
    if (options.searchTerm) {
      conditions.push('(content LIKE ? OR tags LIKE ?)');
      params.push(`%${options.searchTerm}%`, `%${options.searchTerm}%`);
    }
    query += ` WHERE ${conditions.join(' AND ')}`;
  }
  
  query += ' ORDER BY timestamp DESC';
  
  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }
  
  const rows = await db.all(query, ...params);
  return rows.map(row => ({
    ...row,
    tags: JSON.parse(row.tags),
    favorited: Boolean(row.favorited)
  }));
}

// Error Pattern Operations
export async function recordError(error: {
  errorText: string;
  solution: string;
  language: string;
}): Promise<ErrorPattern> {
  const db = await getDb();
  
  // Check if similar error exists
  const existing = await db.get(
    `SELECT * FROM error_patterns 
     WHERE language = ? AND errorText LIKE ? 
     LIMIT 1`,
    error.language,
    `%${error.errorText.substring(0, 50)}%`
  );
  
  if (existing) {
    // Update frequency
    await db.run(
      `UPDATE error_patterns 
       SET frequency = ?, lastEncountered = ?, solution = ?
       WHERE id = ?`,
      existing.frequency + 1,
      new Date().toISOString(),
      error.solution,
      existing.id
    );
    return { ...existing, frequency: existing.frequency + 1 };
  }
  
  // Create new error pattern
  const newError: ErrorPattern = {
    id: uuidv4(),
    ...error,
    frequency: 1,
    lastEncountered: new Date().toISOString()
  };
  
  await db.run(
    `INSERT INTO error_patterns VALUES (?, ?, ?, ?, ?, ?)`,
    newError.id,
    newError.errorText,
    newError.solution,
    newError.language,
    newError.frequency,
    newError.lastEncountered
  );
  
  return newError;
}

export async function getErrorSolutions(errorText: string, language: string): Promise<ErrorPattern[]> {
  const db = await getDb();
  const rows = await db.all(
    `SELECT * FROM error_patterns 
     WHERE language = ? AND errorText LIKE ? 
     ORDER BY frequency DESC 
     LIMIT 5`,
    language,
    `%${errorText.substring(0, 100)}%`
  );
  return rows;
}

// Context Management
export async function updateDeveloperContext(context: Partial<DeveloperContext>): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  
  await db.run(
    `INSERT INTO developer_context (currentApp, activeFile, projectRoot, lastActivity)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       currentApp = excluded.currentApp,
       activeFile = excluded.activeFile,
       projectRoot = excluded.projectRoot,
       lastActivity = excluded.lastActivity`,
    context.currentApp || 'unknown',
    context.activeFile,
    context.projectRoot,
    now
  );
}

export async function getCurrentContext(): Promise<DeveloperContext | null> {
  const db = await getDb();
  const row = await db.get(
    `SELECT * FROM developer_context 
     ORDER BY lastActivity DESC 
     LIMIT 1`
  );
  return row || null;
}

// Maintenance Operations
export async function cleanupOldData(daysToKeep: number = 30): Promise<void> {
  const db = await getDb();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  await db.run(
    `DELETE FROM snippets WHERE timestamp < ?`,
    cutoffDate.toISOString()
  );
  
  await db.run(
    `DELETE FROM developer_context WHERE lastActivity < ?`,
    cutoffDate.toISOString()
  );
}

// Initialize database on import
getDb().catch(err => console.error('Database initialization failed:', err));