import { useEffect, useState } from 'react';
import { FileText, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Dialog } from '../../shared/ui';
import { useServices } from '../../app/services';
import type { ImportInspection, ImportJob, ImportRequest } from './model';

const statuses: Record<string, string> = {
  queued: '等待',
  validating: '校验',
  preparing: '扫描 / 复制',
  indexing: '解析目录',
  committing: '保存',
  succeeded: '导入成功',
  duplicate: '已存在',
  failed: '失败',
  cancelled: '已取消',
};
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { reader } = useServices();
  const [requests, setRequests] = useState<ImportRequest[]>([]);
  const [inspection, setInspection] = useState<ImportInspection>();
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'reference' | 'copy'>('reference');
  useEffect(() => {
    if (!reader) return;
    const off = reader.subscribeImport(setJob);
    void reader
      .importJob()
      .then(setJob)
      .catch((e) => setError(String(e)));
    return off;
  }, [reader]);
  const running = job?.status === 'running';
  async function select(directory: boolean) {
    if (!reader) return;
    setBusy(true);
    setError('');
    try {
      const selected = await reader.select(directory);
      if (!selected.length) return;
      setJob(null);
      setInspection(undefined);
      setRequests(selected.map((s) => ({ ...s, storageMode: mode })));
      if (selected.length === 1) setInspection(await reader.inspect(selected[0]));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function start(entries = requests) {
    if (!reader) return;
    setBusy(true);
    setError('');
    try {
      setJob(await reader.startImport(entries.map((r) => ({ ...r, storageMode: mode }))));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="本地导入" open={open} onClose={onClose}>
      <p className="ui-muted">TXT / EPUB 小说 · CBZ / 图片文件夹漫画</p>
      <div className="ui-row">
        <Button
          variant="primary"
          disabled={!reader || busy || running}
          onClick={() => void select(false)}
        >
          <FileText />
          选择文件
        </Button>
        <Button disabled={!reader || busy || running} onClick={() => void select(true)}>
          <FolderOpen />
          选择漫画文件夹
        </Button>
      </div>
      {!reader && <p className="ui-muted">请在桌面应用中导入本地内容。</p>}
      <label className="reader-import-mode">
        存储方式{' '}
        <select
          className="ui-select"
          value={mode}
          disabled={busy || running}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="reference">引用原文件</option>
          <option value="copy">复制到应用书库</option>
        </select>
      </label>
      <p className="ui-small ui-muted">
        {mode === 'reference'
          ? '保留原位置；移动或删除原文件后需要重新定位。'
          : '额外占用磁盘空间；原文件移动后仍可阅读。'}{' '}
        清理缓存不会删除书籍。
      </p>
      {!job && requests.length > 0 && (
        <>
          <div className="reader-import-list">
            {requests.map((r, index) => (
              <div key={r.sourceToken} className="reader-import-entry">
                <span>{r.displayName}</span>
                <span className="ui-badge">
                  {r.format === 'TXT' || r.format === 'EPUB' ? '小说' : '漫画'} · {r.format}
                </span>
                {requests.length === 1 && (
                  <input
                    className="ui-select"
                    aria-label="书名（可选）"
                    placeholder="书名（可选）"
                    value={r.title ?? ''}
                    onChange={(e) =>
                      setRequests((old) =>
                        old.map((v, i) => (i === index ? { ...v, title: e.target.value } : v)),
                      )
                    }
                  />
                )}
                {r.format === 'TXT' && (
                  <select
                    className="ui-select"
                    aria-label={`${r.displayName} 编码`}
                    value={r.encoding ?? ''}
                    disabled={busy}
                    onChange={(e) => {
                      const encoding = e.target.value || undefined;
                      setRequests((old) =>
                        old.map((v, i) => (i === index ? { ...v, encoding } : v)),
                      );
                      if (requests.length === 1) {
                        setBusy(true);
                        void reader!
                          .inspect(r, encoding)
                          .then(setInspection)
                          .catch((e) => setError(String(e)))
                          .finally(() => setBusy(false));
                      }
                    }}
                  >
                    <option value="">自动检测编码</option>
                    {['UTF-8', 'GB18030', 'UTF-16LE', 'UTF-16BE', 'Big5'].map((e) => (
                      <option key={e}>{e}</option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
          {inspection?.sizeBytes !== undefined && (
            <p className="ui-small ui-muted">
              内容体积 {(inspection.sizeBytes / 1024 / 1024).toFixed(2)} MiB
              {mode === 'copy' ? '，复制将额外占用相应空间。' : '，索引和阅读缓存另计。'}
            </p>
          )}
          {inspection?.pagePreview && (
            <details>
              <summary>页面顺序预览 · {inspection.pageCount} 页</summary>
              <ol className="reader-preview">
                {inspection.pagePreview.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ol>
            </details>
          )}
          {inspection?.preview && (
            <details open>
              <summary>
                正文预览 · {inspection.encoding}
                {inspection.suspect ? ' · 请检查编码' : ''}
              </summary>
              <pre className="reader-preview">{inspection.preview}</pre>
            </details>
          )}
          <div className="ui-dialog-actions">
            <Button variant="primary" disabled={busy} onClick={() => void start()}>
              导入 {requests.length} 项
            </Button>
          </div>
        </>
      )}
      {job && (
        <div aria-live="polite" className="reader-import-list">
          {job.entries.map((entry) => (
            <div key={entry.entryId} className="reader-import-entry">
              <strong>{entry.name}</strong>
              <span>{statuses[entry.status] ?? entry.status}</span>
              {entry.message && (
                <small className={entry.status === 'failed' ? 'reader-error' : 'ui-muted'}>
                  {entry.message}
                </small>
              )}
              {entry.itemId && (
                <Link className="ui-button-text" to="/reader" onClick={onClose}>
                  查看书架
                </Link>
              )}
              {entry.status === 'failed' &&
                (entry.request || requests[entry.entryId]) &&
                !running && (
                  <Button
                    onClick={() => {
                      const request = entry.request ?? requests[entry.entryId];
                      setRequests([request]);
                      setMode(request.storageMode);
                      setInspection(undefined);
                      setJob(null);
                    }}
                  >
                    修改并重试
                  </Button>
                )}
            </div>
          ))}
        </div>
      )}
      {running && (
        <div className="ui-dialog-actions">
          <span className="ui-small ui-muted">关闭弹窗后继续导入</span>
          <Button onClick={() => void reader!.cancelImport().catch((e) => setError(String(e)))}>
            取消导入
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="reader-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}
