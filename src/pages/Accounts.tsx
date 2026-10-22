import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react'
import type { AccountProject, AccountSummary, ImportProjectsResult } from '../../electron/preload'

const TOKEN_URL = 'https://supabase.com/dashboard/account/tokens'

export function Accounts() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    try {
      setAccounts(await window.electronAPI.listAccounts())
    } catch (err: any) {
      setError(err.message)
    }
  }

  useEffect(() => { reload() }, [])

  async function remove(account: AccountSummary) {
    if (!window.confirm(
      `Remove "${account.name}"? Its token is deleted from this computer. ` +
      'Projects you already imported stay and keep working as standalone projects.'
    )) return
    try {
      await window.electronAPI.removeAccount(account.id)
      await reload()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-50">Accounts</h1>
        <p className="text-surface-400 mt-1">
          Connect Supabase accounts with a personal access token to find and import their projects.
          Tokens are encrypted on this computer and never shown again.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <AddAccount onAdded={reload} />

      {accounts === null ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-brand-500" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card text-sm text-surface-400">No accounts yet. Add one above to import its projects.</div>
      ) : (
        accounts.map((account) => (
          <AccountCard key={account.id} account={account} onRemove={() => remove(account)} />
        ))
      )}
    </div>
  )
}

function AddAccount({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await window.electronAPI.addAccount(name, token)
      setName('')
      setToken('')
      onAdded()
    } catch (err: any) {
      setError(err.message ?? 'Could not add the account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-brand-400" />
        <h2 className="font-medium text-surface-200">Add an account</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Name</label>
          <input className="input" placeholder="Personal, Client A…" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Personal access token</label>
          <input
            className="input font-mono" type="password" autoComplete="off" placeholder="sbp_…"
            value={token} onChange={(e) => setToken(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href={TOKEN_URL} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-300"
        >
          <ExternalLink size={13} />
          Create a token in the Supabase dashboard
        </a>
        <button className="btn-primary flex items-center gap-2" disabled={busy || !name.trim() || !token.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          Verify and add
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}

function AccountCard({ account, onRemove }: { account: AccountSummary; onRemove: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4">
        <button className="flex-1 flex items-center gap-3 text-left" onClick={() => setOpen(!open)}>
          <div>
            <p className="font-medium text-surface-100">{account.name}</p>
            <p className="text-xs text-surface-500">Added {new Date(account.createdAt).toLocaleDateString()}</p>
          </div>
          {open ? <ChevronUp size={16} className="text-surface-500" /> : <ChevronDown size={16} className="text-surface-500" />}
        </button>
        <button
          className="p-2 rounded text-surface-500 hover:text-red-400 hover:bg-red-500/10"
          title="Remove account" onClick={onRemove}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {open && <ProjectsPanel account={account} />}
    </div>
  )
}

function ProjectsPanel({ account }: { account: AccountSummary }) {
  const [projects, setProjects] = useState<AccountProject[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportProjectsResult | null>(null)

  async function load() {
    setProjects(null)
    setError(null)
    try {
      setProjects(await window.electronAPI.listAccountProjects(account.id))
    } catch (err: any) {
      setError(err.message ?? 'Could not load projects')
      setProjects([])
    }
  }

  useEffect(() => { load() }, [account.id])

  const importable = (projects ?? []).filter((p) => !p.importedConnectionId && p.status.startsWith('ACTIVE'))

  function toggle(ref: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(ref)) next.delete(ref)
      else next.add(ref)
      return next
    })
  }

  async function importSelected() {
    setBusy(true)
    setResult(null)
    try {
      const res = await window.electronAPI.importAccountProjects(
        account.id,
        [...selected].map((ref) => ({ ref, dbPassword: passwords[ref] || undefined }))
      )
      setResult(res)
      setSelected(new Set())
      setPasswords({})
      await load()
    } catch (err: any) {
      setError(err.message ?? 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-surface-800 px-5 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-surface-400">
          The database password is not available from the API. Enter it to enable database backups;
          storage backups work without it.
        </p>
        <button className="btn-ghost flex items-center gap-1.5 text-sm" onClick={load}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {projects === null && <Loader2 className="animate-spin text-brand-500" />}

      {projects && projects.length > 0 && (
        <ul className="divide-y divide-surface-800 rounded-lg border border-surface-800">
          {projects.map((p) => {
            const imported = !!p.importedConnectionId
            const paused = !p.status.startsWith('ACTIVE')
            return (
              <li key={p.ref} className="px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox" className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                    disabled={imported || paused} checked={selected.has(p.ref)} onChange={() => toggle(p.ref)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100 truncate">{p.name}</p>
                    <p className="text-xs text-surface-500 font-mono truncate">{p.ref} · {p.region}</p>
                  </div>
                  {imported && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 size={12} /> Imported
                    </span>
                  )}
                  {paused && <span className="text-xs text-amber-400">{p.status.toLowerCase().replace(/_/g, ' ')}</span>}
                </div>
                {selected.has(p.ref) && (
                  <input
                    className="input" type="password" autoComplete="off"
                    placeholder="Database password (optional now, required for database backups)"
                    value={passwords[p.ref] ?? ''}
                    onChange={(e) => setPasswords({ ...passwords, [p.ref]: e.target.value })}
                  />
                )}
                {imported && <DbPasswordEditor connectionId={p.importedConnectionId!} />}
              </li>
            )
          })}
        </ul>
      )}

      {projects && projects.length === 0 && !error && (
        <p className="text-sm text-surface-400">This account has no projects.</p>
      )}

      {result && (
        <div className="rounded-lg border border-surface-700 bg-surface-800/50 px-4 py-3 text-sm space-y-1">
          <p className="text-emerald-400">{result.imported.length} project(s) imported.</p>
          {result.imported.some((i) => !i.hasDbUrl) && (
            <p className="text-amber-400">Some have no database password yet; set it below to enable database backups.</p>
          )}
          {result.failed.map((f) => (
            <p key={f.ref} className="text-red-400">{f.ref}: {f.error}</p>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-primary" disabled={busy || selected.size === 0} onClick={importSelected}>
          {busy ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
          Import selected ({selected.size}{importable.length ? ` of ${importable.length}` : ''})
        </button>
      </div>
    </div>
  )
}

function DbPasswordEditor({ connectionId }: { connectionId: string }) {
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      const { source } = await window.electronAPI.setProjectDbPassword(connectionId, password)
      const cfg = await window.electronAPI.getConfig()
      const supabase = cfg.connections.find((c) => c.id === connectionId)?.supabase
      const test = supabase ? await window.electronAPI.testConnection(supabase) : null
      setMessage({
        ok: !!test?.success,
        text: `${test?.message ?? 'Saved.'} (via ${source === 'pooler' ? 'session pooler' : 'direct host'})`,
      })
      if (test?.success) {
        setEditing(false)
        setPassword('')
      }
    } catch (err: any) {
      setMessage({ ok: false, text: err.message ?? 'Could not save the password' })
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button className="text-xs text-brand-400 hover:text-brand-300" onClick={() => setEditing(true)}>
        Set or change database password
      </button>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input" type="password" autoComplete="off" placeholder="Database password"
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <button className="btn-secondary whitespace-nowrap" disabled={busy || !password} onClick={save}>
          {busy ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
          Save and test
        </button>
      </div>
      {message && <p className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>}
    </div>
  )
}
