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
} from 'lucide-react'
import { PgDumpSetup } from '../components/PgDumpSetup'

interface AppConfig {
  supabase: {
    url: string
    serviceRoleKey: string
    dbUrl: string
  }
  backup: {
    include: ('database' | 'storage')[]
    compress: boolean
    encrypt: boolean
    encryptionPassword: string
    retention: {
      enabled: boolean
      keepLast: number
    }
  }
  destinations: {
    local: { enabled: boolean; path: string }
    s3: {
      enabled: boolean
      bucket: string
      region: string
      endpoint: string
      accessKeyId: string
      secretAccessKey: string
      forcePathStyle: boolean
    }
    gcs: { enabled: boolean; bucket: string; credentialsFile: string }
    azure: { enabled: boolean; container: string; connectionString: string }
  }
  schedule: { enabled: boolean; cron: string }
  notifications: {
    enabled: boolean
    webhookUrl: string
    onSuccess: boolean
    onFailure: boolean
  }
}

export function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [activeTab, setActiveTab] = useState<'supabase' | 'destinations' | 'schedule' | 'notifications' | 'pgdump'>('supabase')

  useEffect(() => {
    loadConfig()
  }, [])

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
    } catch (err) {
      console.error('Failed to save config:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    if (!config) return
    setTestResult(null)
    setTesting(true)
    try {
      const result = await window.electronAPI.testConnection(config.supabase)
      setTestResult(result)
    } finally {
      setTesting(false)
    }
  }

  async function handleTestDestination(type: string) {
    if (!config) return
    setTestResult(null)
    const destConfig = (config.destinations as any)[type]
    const result = await window.electronAPI.testDestination(type, destConfig)
    setTestResult(result)
  }

  async function handleBrowseFolder() {
    const path = await window.electronAPI.browseFolder()
    if (path && config) {
      setConfig({
        ...config,
        destinations: {
          ...config.destinations,
          local: { ...config.destinations.local, path },
        },
      })
    }
  }

  function toggleSecret(key: string) {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  const tabs = [
    { key: 'supabase', label: 'Supabase' },
    { key: 'destinations', label: 'Destinations' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'notifications', label: 'Notifications' },
    { key: 'pgdump', label: 'pg_dump' },
  ] as const

  return (
    <div className="space-y-6 max-w-4xl">
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
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : saved ? (
            <CheckCircle2 size={16} />
          ) : (
            <Save size={16} />
          )}
          {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Test Result */}
      {testResult && (
        <div
          className={`card flex items-center gap-3 ${
            testResult.success
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 size={20} className="text-emerald-400" />
          ) : (
            <XCircle size={20} className="text-red-400" />
          )}
          <span className={`text-sm ${testResult.success ? 'text-emerald-300' : 'text-red-300'}`}>
            {testResult.message}
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900 p-1 rounded-lg border border-surface-700">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-surface-700 text-surface-100'
                : 'text-surface-400 hover:text-surface-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="card">
        {activeTab === 'supabase' && (
          <div className="space-y-4">
            <h3 className="font-medium text-surface-200 mb-4">Supabase Connection</h3>

            <div>
              <label className="label">Project URL</label>
              <input
                type="text"
                className="input"
                placeholder="https://your-project.supabase.co"
                value={config.supabase.url}
                onChange={(e) =>
                  setConfig({ ...config, supabase: { ...config.supabase, url: e.target.value } })
                }
              />
            </div>

            <div>
              <label className="label">Service Role Key</label>
              <div className="relative">
                <input
                  type={showSecrets['serviceKey'] ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={config.supabase.serviceRoleKey}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      supabase: { ...config.supabase, serviceRoleKey: e.target.value },
                    })
                  }
                />
                <button
                  onClick={() => toggleSecret('serviceKey')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-300"
                >
                  {showSecrets['serviceKey'] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="label">Database URL</label>
              <div className="relative">
                <input
                  type={showSecrets['dbUrl'] ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="postgresql://postgres:password@db.xxx.supabase.co:5432/postgres"
                  value={config.supabase.dbUrl}
                  onChange={(e) =>
                    setConfig({ ...config, supabase: { ...config.supabase, dbUrl: e.target.value } })
                  }
                />
                <button
                  onClick={() => toggleSecret('dbUrl')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-surface-500 hover:text-surface-300"
                >
                  {showSecrets['dbUrl'] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="btn-secondary flex items-center gap-2"
            >
              {testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        )}

        {activeTab === 'destinations' && (
          <div className="space-y-6">
            {/* Local */}
            <DestinationSection
              title="Local Storage"
              enabled={config.destinations.local.enabled}
              onToggle={(enabled) =>
                setConfig({
                  ...config,
                  destinations: { ...config.destinations, local: { ...config.destinations.local, enabled } },
                })
              }
            >
              <div>
                <label className="label">Backup Path</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input"
                    value={config.destinations.local.path}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        destinations: {
                          ...config.destinations,
                          local: { ...config.destinations.local, path: e.target.value },
                        },
                      })
                    }
                  />
                  <button onClick={handleBrowseFolder} className="btn-secondary shrink-0">
                    <FolderOpen size={16} />
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleTestDestination('local')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <TestTube size={14} />
                Test
              </button>
            </DestinationSection>

            {/* S3 */}
            <DestinationSection
              title="AWS S3 / S3-Compatible"
              description="Works with AWS S3, MinIO, Cloudflare R2, Backblaze B2"
              enabled={config.destinations.s3.enabled}
              onToggle={(enabled) =>
                setConfig({
                  ...config,
                  destinations: { ...config.destinations, s3: { ...config.destinations.s3, enabled } },
                })
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Bucket</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="my-backups"
                    value={config.destinations.s3.bucket}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        destinations: {
                          ...config.destinations,
                          s3: { ...config.destinations.s3, bucket: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Region</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="us-east-1"
                    value={config.destinations.s3.region}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        destinations: {
                          ...config.destinations,
                          s3: { ...config.destinations.s3, region: e.target.value },
                        },
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="label">Custom Endpoint (optional, for S3-compatible services)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="https://s3.us-east-1.amazonaws.com or https://your-minio.example.com"
                  value={config.destinations.s3.endpoint}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        s3: { ...config.destinations.s3, endpoint: e.target.value },
                      },
                    })
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Access Key ID</label>
                  <input
                    type={showSecrets['s3Key'] ? 'text' : 'password'}
                    className="input"
                    value={config.destinations.s3.accessKeyId}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        destinations: {
                          ...config.destinations,
                          s3: { ...config.destinations.s3, accessKeyId: e.target.value },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Secret Access Key</label>
                  <input
                    type={showSecrets['s3Secret'] ? 'text' : 'password'}
                    className="input"
                    value={config.destinations.s3.secretAccessKey}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        destinations: {
                          ...config.destinations,
                          s3: { ...config.destinations.s3, secretAccessKey: e.target.value },
                        },
                      })
                    }
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.destinations.s3.forcePathStyle}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        s3: { ...config.destinations.s3, forcePathStyle: e.target.checked },
                      },
                    })
                  }
                  className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                />
                <span className="text-sm text-surface-300">Force Path Style (required for MinIO/R2)</span>
              </label>
              <button
                onClick={() => handleTestDestination('s3')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <TestTube size={14} />
                Test Connection
              </button>
            </DestinationSection>

            {/* GCS */}
            <DestinationSection
              title="Google Cloud Storage"
              enabled={config.destinations.gcs.enabled}
              onToggle={(enabled) =>
                setConfig({
                  ...config,
                  destinations: { ...config.destinations, gcs: { ...config.destinations.gcs, enabled } },
                })
              }
            >
              <div>
                <label className="label">Bucket</label>
                <input
                  type="text"
                  className="input"
                  placeholder="my-gcs-bucket"
                  value={config.destinations.gcs.bucket}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        gcs: { ...config.destinations.gcs, bucket: e.target.value },
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className="label">Credentials JSON File</label>
                <input
                  type="text"
                  className="input"
                  placeholder="/path/to/service-account.json"
                  value={config.destinations.gcs.credentialsFile}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        gcs: { ...config.destinations.gcs, credentialsFile: e.target.value },
                      },
                    })
                  }
                />
              </div>
              <button
                onClick={() => handleTestDestination('gcs')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <TestTube size={14} />
                Test Connection
              </button>
            </DestinationSection>

            {/* Azure */}
            <DestinationSection
              title="Azure Blob Storage"
              enabled={config.destinations.azure.enabled}
              onToggle={(enabled) =>
                setConfig({
                  ...config,
                  destinations: { ...config.destinations, azure: { ...config.destinations.azure, enabled } },
                })
              }
            >
              <div>
                <label className="label">Container Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="backups"
                  value={config.destinations.azure.container}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        azure: { ...config.destinations.azure, container: e.target.value },
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className="label">Connection String</label>
                <input
                  type={showSecrets['azure'] ? 'text' : 'password'}
                  className="input"
                  placeholder="DefaultEndpointsProtocol=https;AccountName=..."
                  value={config.destinations.azure.connectionString}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      destinations: {
                        ...config.destinations,
                        azure: { ...config.destinations.azure, connectionString: e.target.value },
                      },
                    })
                  }
                />
              </div>
              <button
                onClick={() => handleTestDestination('azure')}
                className="btn-secondary flex items-center gap-2 text-sm"
              >
                <TestTube size={14} />
                Test Connection
              </button>
            </DestinationSection>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <h3 className="font-medium text-surface-200 mb-4">Automatic Scheduling</h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.schedule.enabled}
                onChange={(e) =>
                  setConfig({ ...config, schedule: { ...config.schedule, enabled: e.target.checked } })
                }
                className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
              />
              <span className="text-sm text-surface-200">Enable automatic backups</span>
            </label>

            {config.schedule.enabled && (
              <>
                <div>
                  <label className="label">Cron Expression</label>
                  <input
                    type="text"
                    className="input font-mono"
                    placeholder="0 2 * * *"
                    value={config.schedule.cron}
                    onChange={(e) =>
                      setConfig({ ...config, schedule: { ...config.schedule, cron: e.target.value } })
                    }
                  />
                  <p className="text-xs text-surface-500 mt-1.5">
                    Format: minute hour day month weekday. Example: "0 2 * * *" = every day at 2:00 AM
                  </p>
                </div>

                <div className="bg-surface-800 rounded-lg p-4">
                  <p className="text-sm font-medium text-surface-300 mb-2">Common schedules:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { cron: '0 * * * *', label: 'Every hour' },
                      { cron: '0 */6 * * *', label: 'Every 6 hours' },
                      { cron: '0 2 * * *', label: 'Daily at 2 AM' },
                      { cron: '0 2 * * 0', label: 'Weekly (Sunday 2 AM)' },
                    ].map(({ cron, label }) => (
                      <button
                        key={cron}
                        onClick={() => setConfig({ ...config, schedule: { ...config.schedule, cron } })}
                        className={`text-left px-3 py-2 rounded border text-sm transition-all ${
                          config.schedule.cron === cron
                            ? 'border-brand-500/50 bg-brand-500/10 text-brand-300'
                            : 'border-surface-600 hover:border-surface-500 text-surface-300'
                        }`}
                      >
                        <span className="font-mono text-xs block text-surface-500">{cron}</span>
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Retention Policy</label>
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={config.backup.retention.enabled}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          backup: {
                            ...config.backup,
                            retention: { ...config.backup.retention, enabled: e.target.checked },
                          },
                        })
                      }
                      className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                    />
                    <span className="text-sm text-surface-200">Enable retention (auto-delete old backups)</span>
                  </label>
                  {config.backup.retention.enabled && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-surface-300">Keep last</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        className="input w-20 text-center"
                        value={config.backup.retention.keepLast}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            backup: {
                              ...config.backup,
                              retention: { ...config.backup.retention, keepLast: parseInt(e.target.value) || 7 },
                            },
                          })
                        }
                      />
                      <span className="text-sm text-surface-300">backups</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h3 className="font-medium text-surface-200 mb-4">Webhook Notifications</h3>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config.notifications.enabled}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    notifications: { ...config.notifications, enabled: e.target.checked },
                  })
                }
                className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
              />
              <span className="text-sm text-surface-200">Enable notifications</span>
            </label>

            {config.notifications.enabled && (
              <>
                <div>
                  <label className="label">Webhook URL (Slack, Discord, or custom)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="https://hooks.slack.com/services/... or https://discord.com/api/webhooks/..."
                    value={config.notifications.webhookUrl}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        notifications: { ...config.notifications, webhookUrl: e.target.value },
                      })
                    }
                  />
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.notifications.onSuccess}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          notifications: { ...config.notifications, onSuccess: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                    />
                    <span className="text-sm text-surface-300">Notify on success</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.notifications.onFailure}
                      onChange={(e) =>
                        setConfig({
                          ...config,
                          notifications: { ...config.notifications, onFailure: e.target.checked },
                        })
                      }
                      className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-brand-500"
                    />
                    <span className="text-sm text-surface-300">Notify on failure</span>
                  </label>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'pgdump' && (
          <div className="space-y-4">
            <div>
              <h3 className="font-medium text-surface-200 mb-1">pg_dump Setup</h3>
              <p className="text-sm text-surface-400 mb-4">
                Database backups require <code className="font-mono text-brand-400 text-xs bg-brand-500/10 px-1.5 py-0.5 rounded">pg_dump</code> to
                be available. The app will automatically detect any existing installation.
                You can also download the official binary or point to an existing one.
              </p>
            </div>
            <PgDumpSetup />
          </div>
        )}
      </div>
    </div>
  )
}

function DestinationSection({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string
  description?: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
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
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-surface-700 rounded-full peer peer-checked:bg-brand-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
        </label>
      </div>
      {enabled && <div className="space-y-3 mt-4 pt-4 border-t border-surface-700">{children}</div>}
    </div>
  )
}
