import { useState, useEffect } from 'react'
import {
  Save,
  TestTube,
  FolderOpen,
  Loader2,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Server,
  Calendar,
  Database,
  Settings2,
} from 'lucide-react'
import { PgDumpSetup } from '../components/PgDumpSetup'

// ─── Types (local mirrors to avoid preload import in renderer) ─────────────────

interface ConnectionConfig {
  id: string
  name: string
  supabase: { url: string; serviceRoleKey: string; dbUrl: string }
  backup: {
    include: ('database' | 'storage')[]
    compress: boolean
    encrypt: boolean
    encryptionPassword: string
    retention: { enabled: boolean; keepLast: number }
  }
  schedule: { enabled: boolean; cron: string }
}

interface AppConfig {
  connections: ConnectionConfig[]
  destinations: {
    local: { enabled: boolean; path: string }
    s3: {
      enabled: boolean; bucket: string; region: string; endpoint: string
      accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean
    }
    gcs: { enabled: boolean; bucket: string; credentialsFile: string }
    azure: { enabled: boolean; container: string; connectionString: string }
  }
  notifications: {
    enabled: boolean; webhookUrl: string; onSuccess: boolean; onFailure: boolean
  }
}

const CRON_PRESETS = [
  { cron: '0 * * * *',    label: 'Every hour' },
  { cron: '0 */6 * * *',  label: 'Every 6 hours' },
  { cron: '0 2 * * *',    label: 'Daily at 2 AM' },
  { cron: '0 2 * * 1',    label: 'Weekly (Mon 2 AM)' },
]

// ─── Main component ────────────────────────────────────────────────────────────

export function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [activeTab, setActiveTab] = useState<'connections' | 'destinations' | 'notifications' | 'pgdump'>('connections')

  // Connection editor state
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingData, setEditingData] = useState<ConnectionConfig | null>(null)
  const [isNewConn, setIsNewConn] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [testing, setTesting] = useState<string | null>(null)

  // Destination test result
  const [destTestResult, setDestTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Secret visibility
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  useEffect(() => { loadConfig() }, [])

  async function loadConfig() {
    try {
      const cfg = await window.electronAPI.getConfig()
      setConfig(cfg)
    } catch (err) {
      console.error('Failed to load config:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!config) return
    setSaving(true)
    try {
      await window.electronAPI.saveConfig(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  function toggleSecret(key: string) {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Connection editor ────────────────────────────────────────────────────────

  function startEdit(conn: ConnectionConfig) {
    setExpandedId(conn.id)
    setEditingData(JSON.parse(JSON.stringify(conn)))
    setIsNewConn(false)
  }

  function addConnection() {
    if (!config) return
    const newConn: ConnectionConfig = {
      id: `conn_${Date.now()}`,
      name: 'New Connection',
      supabase: { url: '', serviceRoleKey: '', dbUrl: '' },
      backup: {
        include: ['database', 'storage'],
        compress: true,
        encrypt: false,
        encryptionPassword: '',
        retention: { enabled: true, keepLast: 7 },
      },
      schedule: { enabled: false, cron: '0 2 * * *' },
    }
    setConfig({ ...config, connections: [...config.connections, newConn] })
    setExpandedId(newConn.id)
    setEditingData(JSON.parse(JSON.stringify(newConn)))
    setIsNewConn(true)
  }

  function saveEdit() {
    if (!config || !editingData) return
    setConfig({
      ...config,
      connections: config.connections.map((c) =>
        c.id === editingData.id ? editingData : c
      ),
    })
    setExpandedId(null)
    setEditingData(null)
    setIsNewConn(false)
  }

  function cancelEdit() {
    if (!config || !editingData) return
    if (isNewConn) {
      // Remove the just-added placeholder
      setConfig({
        ...config,
        connections: config.connections.filter((c) => c.id !== editingData.id),
      })
    }
    setExpandedId(null)
    setEditingData(null)
    setIsNewConn(false)
  }

  function deleteConnection(id: string) {
    if (!config || config.connections.length <= 1) return
    setConfig({ ...config, connections: config.connections.filter((c) => c.id !== id) })
    if (expandedId === id) { setExpandedId(null); setEditingData(null) }
  }

  function updateEditingField(path: string[], value: any) {
    if (!editingData) return
    const updated = JSON.parse(JSON.stringify(editingData))
    let cur: any = updated
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]]
    cur[path[path.length - 1]] = value
    setEditingData(updated)
  }

  async function handleTestConnection(conn: ConnectionConfig) {
    setTesting(conn.id)
    try {
      const result = await window.electronAPI.testConnection(conn.supabase)
      setTestResults((prev) => ({ ...prev, [conn.id]: result }))
    } finally {
      setTesting(null)
    }
  }

  async function handleTestDestination(type: string) {
    if (!config) return
    setDestTestResult(null)
    const destConfig = (config.destinations as any)[type]
    const result = await window.electronAPI.testDestination(type, destConfig)
    setDestTestResult(result)
  }

  async function handleBrowseFolder() {
    const p = await window.electronAPI.browseFolder()
    if (p && config) {
      setConfig({
        ...config,
        destinations: { ...config.destinations, local: { ...config.destinations.local, path: p } },
      })
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const tabs = [
    { key: 'connections',   label: 'Connections',   icon: <Server size={14} /> },
    { key: 'destinations',  label: 'Destinations',  icon: <Database size={14} /> },
    { key: 'notifications', label: 'Notifications', icon: <Settings2 size={14} /> },
    { key: 'pgdump',        label: 'pg_dump',       icon: null },
  ] as const

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-50">Settings</h1>
          <p className="text-surface-400 mt-1">Configure your backup preferences</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-lg border border-surface-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-surface-700 text-surface-100'
                : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Connections tab ──────────────────────────────────────────────────── */}
      {activeTab === 'connections' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-surface-400">
              {config.connections.length} connection{config.connections.length !== 1 ? 's' : ''} configured
            </p>
            <button onClick={addConnection} className="btn-secondary flex items-center gap-2 text-sm">
              <Plus size={14} />
              Add Connection
            </button>
          </div>

          {config.connections.map((conn) => {
            const isEditing = expandedId === conn.id
            const ed = isEditing ? editingData! : conn
            const testResult = testResults[conn.id]

            return (
              <div
                key={conn.id}
                className={`rounded-xl border transition-all ${
                  isEditing
                    ? 'border-brand-500/40 bg-brand-500/3'
                    : 'border-surface-700 bg-surface-800/20'
                }`}
              >
                {/* Card header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <div
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      conn.supabase.dbUrl ? 'bg-emerald-400' : 'bg-surface-600'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-200 truncate">{conn.name}</p>
                    <p className="text-xs text-surface-500 truncate">
                      {conn.supabase.url || 'URL not configured'}
                      {conn.schedule.enabled && (
                        <span className="ml-2 text-brand-400 inline-flex items-center gap-1">
                          <Calendar size={10} />
                          {conn.schedule.cron}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isEditing && (
                      <>
                        <button
                          onClick={() => startEdit(conn)}
                          className="btn-secondary text-xs px-2.5 py-1"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteConnection(conn.id)}
                          disabled={config.connections.length <= 1}
                          className="p-1.5 rounded hover:bg-red-500/10 text-surface-500 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Delete connection"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => isEditing ? cancelEdit() : startEdit(conn)}
                      className="p-1.5 rounded hover:bg-surface-700 text-surface-500 transition-colors"
                    >
                      {isEditing ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Expanded editor */}
                {isEditing && editingData && (
                  <div className="px-4 pb-4 border-t border-surface-700/50 pt-4 space-y-5">

                    {/* Name */}
                    <div>
                      <label className="label">Connection Name</label>
                      <input
                        type="text"
                        className="input"
                        placeholder="Production"
                        value={editingData.name}
                        onChange={(e) => updateEditingField(['name'], e.target.value)}
                      />
                    </div>

                    {/* Supabase */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Supabase</p>

                      <div>
                        <label className="label">Project URL</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="https://your-project.supabase.co"
                          value={editingData.supabase.url}
                          onChange={(e) => updateEditingField(['supabase', 'url'], e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="label">Service Role Key</label>
                        <div className="relative">
                          <input
                            type={showSecrets[`serviceKey_${conn.id}`] ? 'text' : 'password'}
                            className="input pr-10"
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                            value={editingData.supabase.serviceRoleKey}
                            onChange={(e) => updateEditingField(['supabase', 'serviceRoleKey'], e.target.value)}
                          />
                          <button
                            onClick={() => toggleSecret(`serviceKey_${conn.id}`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-300"
                          >
                            {showSecrets[`serviceKey_${conn.id}`] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="label">Database URL</label>
                        <div className="relative">
                          <input
                            type={showSecrets[`dbUrl_${conn.id}`] ? 'text' : 'password'}
                            className="input pr-10"
                            placeholder="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
                            value={editingData.supabase.dbUrl}
                            onChange={(e) => updateEditingField(['supabase', 'dbUrl'], e.target.value)}
                          />
                          <button
                            onClick={() => toggleSecret(`dbUrl_${conn.id}`)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-300"
                          >
                            {showSecrets[`dbUrl_${conn.id}`] ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      {/* Test connection */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleTestConnection(editingData)}
                          disabled={testing === conn.id}
                          className="btn-secondary flex items-center gap-2 text-sm"
                        >
                          {testing === conn.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <TestTube size={14} />}
                          {testing === conn.id ? 'Testing...' : 'Test Connection'}
                        </button>
                        {testResult && (
                          <span
                            className={`flex items-center gap-1.5 text-xs ${
                              testResult.success ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {testResult.success
                              ? <CheckCircle2 size={13} />
                              : <XCircle size={13} />}
                            {testResult.message}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Backup options */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Backup Options</p>

                      <div>
                        <label className="label text-xs">Include</label>
                        <div className="flex gap-3">
                          {(['database', 'storage'] as const).map((item) => (
                            <label key={item} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={editingData.backup.include.includes(item)}
                                onChange={(e) => {
                                  const current = editingData.backup.include
                                  const next = e.target.checked
                                    ? [...current, item]
                                    : current.filter((i) => i !== item)
                                  if (next.length > 0) updateEditingField(['backup', 'include'], next)
                                }}
                                className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                              />
                              <span className="text-sm text-surface-300 capitalize">{item}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingData.backup.compress}
                            onChange={(e) => updateEditingField(['backup', 'compress'], e.target.checked)}
                            className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                          />
                          <span className="text-sm text-surface-300">Compress (tar.gz)</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingData.backup.encrypt}
                            onChange={(e) => updateEditingField(['backup', 'encrypt'], e.target.checked)}
                            className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                          />
                          <span className="text-sm text-surface-300">Encrypt (AES-256)</span>
                        </label>
                      </div>

                      {editingData.backup.encrypt && (
                        <div>
                          <label className="label">Encryption Password</label>
                          <input
                            type={showSecrets[`encPwd_${conn.id}`] ? 'text' : 'password'}
                            className="input"
                            placeholder="Strong password..."
                            value={editingData.backup.encryptionPassword}
                            onChange={(e) => updateEditingField(['backup', 'encryptionPassword'], e.target.value)}
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingData.backup.retention.enabled}
                            onChange={(e) => updateEditingField(['backup', 'retention', 'enabled'], e.target.checked)}
                            className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                          />
                          <span className="text-sm text-surface-300">Auto-delete old backups — keep last</span>
                        </label>
                        {editingData.backup.retention.enabled && (
                          <input
                            type="number"
                            min={1}
                            max={100}
                            className="input w-16 text-center text-sm"
                            value={editingData.backup.retention.keepLast}
                            onChange={(e) =>
                              updateEditingField(['backup', 'retention', 'keepLast'], parseInt(e.target.value) || 7)
                            }
                          />
                        )}
                      </div>
                    </div>

                    {/* Schedule */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Schedule</p>

                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editingData.schedule.enabled}
                          onChange={(e) => updateEditingField(['schedule', 'enabled'], e.target.checked)}
                          className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                        />
                        <span className="text-sm text-surface-200">Enable automatic backup</span>
                      </label>

                      {editingData.schedule.enabled && (
                        <>
                          <div>
                            <label className="label">Cron Expression</label>
                            <input
                              type="text"
                              className="input font-mono"
                              placeholder="0 2 * * *"
                              value={editingData.schedule.cron}
                              onChange={(e) => updateEditingField(['schedule', 'cron'], e.target.value)}
                            />
                            <p className="text-xs text-surface-500 mt-1">
                              Format: minute hour day month weekday
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {CRON_PRESETS.map(({ cron, label }) => (
                              <button
                                key={cron}
                                onClick={() => updateEditingField(['schedule', 'cron'], cron)}
                                className={`px-2.5 py-1 rounded text-xs border transition-all ${
                                  editingData.schedule.cron === cron
                                    ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                                    : 'border-surface-600 hover:border-surface-500 text-surface-400'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Save / Cancel */}
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveEdit} className="btn-primary text-sm">
                        Save Connection
                      </button>
                      <button onClick={cancelEdit} className="btn-secondary text-sm">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {config.connections.length === 0 && (
            <div className="card text-center py-10 text-surface-500">
              <Server size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No connections yet. Click "Add Connection" to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Destinations tab ─────────────────────────────────────────────────── */}
      {activeTab === 'destinations' && (
        <div className="space-y-4">
          {destTestResult && (
            <div
              className={`card flex items-center gap-3 ${
                destTestResult.success
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-red-500/30 bg-red-500/5'
              }`}
            >
              {destTestResult.success
                ? <CheckCircle2 size={18} className="text-emerald-400" />
                : <XCircle size={18} className="text-red-400" />}
              <span className={`text-sm ${destTestResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
                {destTestResult.message}
              </span>
            </div>
          )}

          {/* Local */}
          <DestinationSection
            title="Local Storage"
            enabled={config.destinations.local.enabled}
            onToggle={(v) => setConfig({ ...config, destinations: { ...config.destinations, local: { ...config.destinations.local, enabled: v } } })}
          >
            <div>
              <label className="label">Backup Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input"
                  value={config.destinations.local.path}
                  onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, local: { ...config.destinations.local, path: e.target.value } } })}
                />
                <button onClick={handleBrowseFolder} className="btn-secondary shrink-0">
                  <FolderOpen size={16} />
                </button>
              </div>
            </div>
            <button onClick={() => handleTestDestination('local')} className="btn-secondary flex items-center gap-2 text-sm">
              <TestTube size={14} />Test
            </button>
          </DestinationSection>

          {/* S3 */}
          <DestinationSection
            title="AWS S3 / S3-Compatible"
            description="Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2"
            enabled={config.destinations.s3.enabled}
            onToggle={(v) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, enabled: v } } })}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Bucket</label>
                <input type="text" className="input" placeholder="my-backups" value={config.destinations.s3.bucket}
                  onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, bucket: e.target.value } } })} />
              </div>
              <div>
                <label className="label">Region</label>
                <input type="text" className="input" placeholder="us-east-1" value={config.destinations.s3.region}
                  onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, region: e.target.value } } })} />
              </div>
            </div>
            <div>
              <label className="label">Endpoint (optional)</label>
              <input type="text" className="input" placeholder="https://your-minio.example.com" value={config.destinations.s3.endpoint}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, endpoint: e.target.value } } })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Access Key ID</label>
                <input type={showSecrets['s3Key'] ? 'text' : 'password'} className="input" value={config.destinations.s3.accessKeyId}
                  onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, accessKeyId: e.target.value } } })} />
              </div>
              <div>
                <label className="label">Secret Access Key</label>
                <input type={showSecrets['s3Secret'] ? 'text' : 'password'} className="input" value={config.destinations.s3.secretAccessKey}
                  onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, secretAccessKey: e.target.value } } })} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={config.destinations.s3.forcePathStyle}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, s3: { ...config.destinations.s3, forcePathStyle: e.target.checked } } })}
                className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500" />
              <span className="text-sm text-surface-300">Force Path Style (required for MinIO/R2)</span>
            </label>
            <button onClick={() => handleTestDestination('s3')} className="btn-secondary flex items-center gap-2 text-sm">
              <TestTube size={14} />Test Connection
            </button>
          </DestinationSection>

          {/* GCS */}
          <DestinationSection
            title="Google Cloud Storage"
            enabled={config.destinations.gcs.enabled}
            onToggle={(v) => setConfig({ ...config, destinations: { ...config.destinations, gcs: { ...config.destinations.gcs, enabled: v } } })}
          >
            <div>
              <label className="label">Bucket</label>
              <input type="text" className="input" placeholder="my-gcs-bucket" value={config.destinations.gcs.bucket}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, gcs: { ...config.destinations.gcs, bucket: e.target.value } } })} />
            </div>
            <div>
              <label className="label">Credentials JSON File</label>
              <input type="text" className="input" placeholder="/path/to/service-account.json" value={config.destinations.gcs.credentialsFile}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, gcs: { ...config.destinations.gcs, credentialsFile: e.target.value } } })} />
            </div>
            <button onClick={() => handleTestDestination('gcs')} className="btn-secondary flex items-center gap-2 text-sm">
              <TestTube size={14} />Test Connection
            </button>
          </DestinationSection>

          {/* Azure */}
          <DestinationSection
            title="Azure Blob Storage"
            enabled={config.destinations.azure.enabled}
            onToggle={(v) => setConfig({ ...config, destinations: { ...config.destinations, azure: { ...config.destinations.azure, enabled: v } } })}
          >
            <div>
              <label className="label">Container Name</label>
              <input type="text" className="input" placeholder="backups" value={config.destinations.azure.container}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, azure: { ...config.destinations.azure, container: e.target.value } } })} />
            </div>
            <div>
              <label className="label">Connection String</label>
              <input type={showSecrets['azure'] ? 'text' : 'password'} className="input"
                placeholder="DefaultEndpointsProtocol=https;AccountName=..." value={config.destinations.azure.connectionString}
                onChange={(e) => setConfig({ ...config, destinations: { ...config.destinations, azure: { ...config.destinations.azure, connectionString: e.target.value } } })} />
            </div>
            <button onClick={() => handleTestDestination('azure')} className="btn-secondary flex items-center gap-2 text-sm">
              <TestTube size={14} />Test Connection
            </button>
          </DestinationSection>
        </div>
      )}

      {/* ── Notifications tab ─────────────────────────────────────────────────── */}
      {activeTab === 'notifications' && (
        <div className="card space-y-4">
          <h3 className="font-medium text-surface-200 mb-2">Webhook Notifications</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={config.notifications.enabled}
              onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, enabled: e.target.checked } })}
              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
            />
            <span className="text-sm text-surface-200">Enable notifications</span>
          </label>

          {config.notifications.enabled && (
            <>
              <div>
                <label className="label">Webhook URL (Slack, Discord, or custom)</label>
                <input type="text" className="input"
                  placeholder="https://hooks.slack.com/services/..."
                  value={config.notifications.webhookUrl}
                  onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, webhookUrl: e.target.value } })} />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config.notifications.onSuccess}
                    onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, onSuccess: e.target.checked } })}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500" />
                  <span className="text-sm text-surface-300">Notify on success</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={config.notifications.onFailure}
                    onChange={(e) => setConfig({ ...config, notifications: { ...config.notifications, onFailure: e.target.checked } })}
                    className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500" />
                  <span className="text-sm text-surface-300">Notify on failure</span>
                </label>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── pg_dump tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'pgdump' && (
        <div className="card space-y-4">
          <div>
            <h3 className="font-medium text-surface-200 mb-1">pg_dump Setup</h3>
            <p className="text-sm text-surface-400">
              Database backups require{' '}
              <code className="font-mono text-brand-400 text-xs bg-brand-500/10 px-1.5 py-0.5 rounded">
                pg_dump
              </code>{' '}
              to be available. The app will automatically detect any existing installation.
            </p>
          </div>
          <PgDumpSetup />
        </div>
      )}
    </div>
  )
}

// ─── DestinationSection helper ─────────────────────────────────────────────────

function DestinationSection({
  title, description, enabled, onToggle, children,
}: {
  title: string
  description?: string
  enabled: boolean
  onToggle: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className={`border rounded-lg p-4 transition-all ${enabled ? 'border-brand-500/30 bg-brand-500/5' : 'border-surface-700'}`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium text-surface-200">{title}</h4>
          {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} className="sr-only peer" />
          <div className="w-9 h-5 bg-surface-700 rounded-full peer peer-checked:bg-brand-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>
      {enabled && <div className="space-y-3 mt-4 pt-4 border-t border-surface-700">{children}</div>}
    </div>
  )
}
