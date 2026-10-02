import { createClient, type Client, type ResultSet } from '@libsql/client'

interface Arg { type: string; value?: string }
interface Statement { sql: string; args?: Arg[] }
type Condition = { type: 'ok'; step: number } | { type: 'not'; cond: Condition }
interface Step { stmt: Statement; condition?: Condition }
type PipelineRequest = { type: 'execute'; stmt: Statement }
  | { type: 'batch'; batch: { steps: Step[] } }
  | { type: 'close' }

function encodeResult(result: ResultSet) {
  return {
    cols: result.columns.map((name) => ({ name })),
    rows: result.rows.map((row) => result.columns.map((name) => {
      const value = row[name]
      return value == null ? { type: 'null' }
        : { type: typeof value === 'number' || typeof value === 'bigint' ? 'integer' : 'text', value: String(value) }
    })),
    affected_row_count: result.rowsAffected,
    last_insert_rowid: result.lastInsertRowid?.toString(),
  }
}

// Execute the endpoint's real SQL, translating only the HTTP protocol. Each
// batch owns the connection until COMMIT/ROLLBACK, as SQLite's writer lock does.
export function sqliteTursoFetch(db: Client): typeof fetch {
  let pending: Promise<unknown> = Promise.resolve()
  return async (_input, init) => {
    const payload = JSON.parse(String(init?.body)) as { requests: PipelineRequest[] }
    const run = async () => {
      const execute = async (stmt: Statement) => encodeResult(await db.execute({
        sql: stmt.sql,
        args: stmt.args?.map((arg) => arg.type === 'integer' ? Number(arg.value) : arg.value ?? null) ?? [],
      }))
      const results: unknown[] = []
      for (const request of payload.requests) {
        try {
          if (request.type === 'close') {
            results.push({ type: 'ok', response: { type: 'close' } })
          } else if (request.type === 'execute') {
            results.push({ type: 'ok', response: { type: 'execute', result: await execute(request.stmt) } })
          } else {
            const stepResults: Array<ReturnType<typeof encodeResult> | null> = []
            const stepErrors: Array<{ message: string } | null> = []
            const allows = (condition: Condition): boolean => condition.type === 'ok'
              ? stepResults[condition.step] != null : !allows(condition.cond)
            for (const step of request.batch.steps) {
              if (step.condition && !allows(step.condition)) {
                stepResults.push(null)
                stepErrors.push(null)
                continue
              }
              try {
                stepResults.push(await execute(step.stmt))
                stepErrors.push(null)
              } catch (error) {
                stepResults.push(null)
                stepErrors.push({ message: error instanceof Error ? error.message : String(error) })
              }
            }
            results.push({ type: 'ok', response: { type: 'batch', result: { step_results: stepResults, step_errors: stepErrors } } })
          }
        } catch (error) {
          results.push({ type: 'error', error: { message: error instanceof Error ? error.message : String(error) } })
        }
      }
      return Response.json({ results })
    }
    const result = pending.then(run)
    pending = result.catch(() => {})
    return result
  }
}

export async function createReadingDatabase(): Promise<Client> {
  const db = createClient({ url: 'file::memory:' })
  await db.executeMultiple(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE articles (id TEXT PRIMARY KEY, title TEXT NOT NULL, category_tag TEXT NOT NULL);
    CREATE TABLE feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL REFERENCES articles(id), signal TEXT NOT NULL,
      device_id TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE quizzes (id INTEGER PRIMARY KEY, category TEXT NOT NULL);
    CREATE TABLE quiz_attempts (quiz_id INTEGER, device_id TEXT, correct INTEGER, answered_at INTEGER);
    CREATE TABLE push_subscriptions (device_id TEXT, updated_at INTEGER);
  `)
  return db
}
