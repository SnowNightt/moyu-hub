import Database from '@tauri-apps/plugin-sql';
export type SqlDatabase = Pick<Database, 'select' | 'execute'>;
export function createDatabaseConnection() {
  let pending: Promise<Database> | undefined;
  return () =>
    (pending ??= Database.load('sqlite:moyuhub.db').catch((error) => {
      pending = undefined;
      throw new Error(`本机数据库不可用：${String(error)}`);
    }));
}
