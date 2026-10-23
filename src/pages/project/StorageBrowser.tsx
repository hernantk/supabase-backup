import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Download, File as FileIcon, Folder, FolderOpen, Globe, Link2, Lock, Plus, Trash2, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { call, useManagerQuery } from '../../lib/api'
import { formatBytes, formatRelative } from '../../lib/format'
import { CenteredSpinner, ConfirmSheet, EmptyState, Notice, Sheet, Spinner, Switch } from '../../components/ui'
import { Requires, SideItem, SplitView, useWorkspaceProject } from './ProjectWorkspace'
import type { StorageEntry } from '../../../electron/shared/managerApi'

export function StorageBrowser() {
  const project = useWorkspaceProject()
  return (
    <Requires need="storage" project={project}>
      <StorageInner />
    </Requires>
  )
}

function StorageInner() {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const client = useQueryClient()
  const input = { connectionId: project.connectionId }

  const buckets = useManagerQuery('storage.buckets', input)
  const [bucket, setBucket] = useState<string | null>(null)
  const [prefix, setPrefix] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'files'; paths: string[]; label: string } | { kind: 'bucket'; name: string } | null>(null)
  const [pendingUpload, setPendingUpload] = useState(false)

  const objects = useManagerQuery('storage.list', { ...input, bucket: bucket ?? '', prefix, search: search || undefined }, { enabled: !!bucket })

  const refreshBuckets = () => client.invalidateQueries({ queryKey: ['storage.buckets'] })
  const refreshObjects = () => client.invalidateQueries({ queryKey: ['storage.list'] })

  function openBucket(name: string) {
    setBucket(name)
    setPrefix('')
    setSearch('')
    setSelected(new Set())
    setToast(null)
  }

  const upload = useMutation({
    mutationFn: () => call('storage.upload', { ...input, bucket: bucket!, prefix }),
    onSuccess: ({ uploaded }) => {
      if (uploaded > 0) setToast({ tone: 'success', text: t('storage.uploaded', { count: uploaded }) })
      refreshObjects()
    },
    onError: (err: Error) => setToast({ tone: 'error', text: err.message }),
  })

  async function download(entry: StorageEntry) {
    try {
      const { savedTo } = await call('storage.download', { ...input, bucket: bucket!, path: entry.path })
      if (savedTo) setToast({ tone: 'success', text: t('storage.savedTo', { path: savedTo }) })
    } catch (err: any) {
      setToast({ tone: 'error', text: err.message })
    }
  }

  async function copyLink(entry: StorageEntry) {
    try {
      const { url, signed } = await call('storage.url', { ...input, bucket: bucket!, path: entry.path, expiresIn: 3600 })
      await navigator.clipboard.writeText(url)
      setToast({ tone: 'success', text: signed ? t('storage.copiedSigned') : t('storage.copiedPublic') })
    } catch (err: any) {
      setToast({ tone: 'error', text: err.message })
    }
  }

  const crumbs = prefix ? prefix.split('/') : []

  return (
    <SplitView
      title={t('projects.tabs.storage')}
      action={
        <button className="p-1 rounded-md text-surface-400 hover:text-surface-100 hover:bg-surface-800" onClick={() => setCreating(true)} aria-label={t('storage.newBucket')} title={t('storage.newBucket')}>
          <Plus size={16} />
        </button>
      }
      side={
        <>
          <p className="px-4 pb-1 text-[11.5px] font-semibold text-surface-500">{t('storage.buckets')}</p>
          {buckets.isLoading ? (
            <CenteredSpinner />
          ) : buckets.error ? (
            <div className="px-3"><Notice tone="error">{buckets.error.message}</Notice></div>
          ) : (buckets.data?.length ?? 0) === 0 ? (
            <p className="px-4 text-[13px] text-surface-500">{t('storage.noBuckets.body')}</p>
          ) : (
            <ul className="px-2 pb-3 space-y-px">
              {buckets.data!.map((b) => (
                <li key={b.id}>
                  <SideItem active={bucket === b.name} onClick={() => openBucket(b.name)}>
                    {b.public ? <Globe size={14} className="shrink-0" /> : <Lock size={14} className="shrink-0" />}
                    <span className="truncate">{b.name}</span>
                  </SideItem>
                </li>
              ))}
            </ul>
          )}
          {bucket && (
            <div className="px-2 pb-3">
              <button className="btn-ghost !text-red-400 hover:!bg-red-500/10 w-full !justify-start !px-2 !py-1.5 text-[13px]" onClick={() => setPendingDelete({ kind: 'bucket', name: bucket })}>
                <Trash2 size={14} />
                {t('storage.deleteBucket')}
              </button>
            </div>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!bucket ? (
          (buckets.data?.length ?? 0) === 0 && !buckets.isLoading ? (
            <EmptyState
              icon={FolderOpen}
              title={t('storage.noBuckets.title')}
              body={t('storage.noBuckets.body')}
              action={<button className="btn-primary" onClick={() => setCreating(true)}>{t('storage.newBucket')}</button>}
            />
          ) : (
            <EmptyState icon={FolderOpen} title={t('storage.selectBucket.title')} body={t('storage.selectBucket.body')} />
          )
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <nav className="flex items-center gap-1 text-[13.5px] min-w-0 flex-1" aria-label="breadcrumb">
                <button className="text-brand-400 hover:underline" onClick={() => { setPrefix(''); setSelected(new Set()) }}>
                  {bucket}
                </button>
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <ChevronRight size={13} className="text-surface-500" />
                    <button
                      className="text-surface-200 hover:underline"
                      onClick={() => { setPrefix(crumbs.slice(0, i + 1).join('/')); setSelected(new Set()) }}
                    >
                      {c}
                    </button>
                  </span>
                ))}
              </nav>
              <input
                className="input !w-52"
                placeholder={t('storage.searchPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {selected.size > 0 && (
                <button
                  className="btn-danger"
                  onClick={() => setPendingDelete({ kind: 'files', paths: [...selected], label: t('storage.deleteManyTitle', { count: selected.size }) })}
                >
                  <Trash2 size={14} />
                  {t('storage.deleteSelected', { count: selected.size })}
                </button>
              )}
              <button className="btn-primary" disabled={upload.isPending} onClick={() => (project.protected ? setPendingUpload(true) : upload.mutate())}>
                {upload.isPending ? <Spinner className="!text-current" /> : <Upload size={14} />}
                {t('storage.upload')}
              </button>
            </div>

            {toast && <Notice tone={toast.tone}>{toast.text}</Notice>}
            {objects.error && <Notice tone="error">{objects.error.message}</Notice>}

            {objects.isLoading ? (
              <CenteredSpinner />
            ) : (objects.data?.length ?? 0) === 0 && !objects.error ? (
              <EmptyState icon={Folder} title={t('storage.emptyFolder.title')} body={t('storage.emptyFolder.body')} />
            ) : (
              <ul className="list-group">
                {objects.data?.map((entry) => (
                  <li key={entry.path} className="list-row !min-h-[48px] group">
                    {entry.kind === 'file' ? (
                      <input
                        type="checkbox"
                        aria-label={entry.name}
                        checked={selected.has(entry.path)}
                        onChange={() => {
                          const next = new Set(selected)
                          if (next.has(entry.path)) next.delete(entry.path)
                          else next.add(entry.path)
                          setSelected(next)
                        }}
                      />
                    ) : (
                      <span className="w-4" />
                    )}
                    {entry.kind === 'folder' ? (
                      <button className="flex items-center gap-2.5 flex-1 min-w-0 text-left" onClick={() => { setPrefix(entry.path); setSelected(new Set()) }}>
                        <Folder size={16} className="text-brand-400 shrink-0" />
                        <span className="truncate text-[14px] text-surface-100">{entry.name}</span>
                      </button>
                    ) : (
                      <span className="flex items-center gap-2.5 flex-1 min-w-0">
                        <FileIcon size={16} className="text-surface-400 shrink-0" />
                        <span className="truncate text-[14px] text-surface-100">{entry.name}</span>
                      </span>
                    )}
                    <span className="w-24 text-right text-[12.5px] text-surface-400 shrink-0">{entry.size !== undefined ? formatBytes(entry.size) : ''}</span>
                    <span className="hidden md:block w-28 text-right text-[12.5px] text-surface-500 shrink-0">
                      {entry.updatedAt ? formatRelative(entry.updatedAt) : ''}
                    </span>
                    {entry.kind === 'file' ? (
                      <span className="flex gap-0.5 shrink-0 opacity-60 group-hover:opacity-100">
                        <button className="p-1.5 rounded hover:bg-surface-800" title={t('storage.copyUrl')} onClick={() => copyLink(entry)}>
                          <Link2 size={14} />
                        </button>
                        <button className="p-1.5 rounded hover:bg-surface-800" title={t('storage.download')} onClick={() => download(entry)}>
                          <Download size={14} />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-red-500/10 hover:text-red-400"
                          title={t('common.delete')}
                          onClick={() => setPendingDelete({ kind: 'files', paths: [entry.path], label: t('storage.deleteFileTitle', { name: entry.name }) })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </span>
                    ) : (
                      <span className="w-[88px] shrink-0" />
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="px-1 text-[12.5px] text-surface-500">{t('storage.folderNote')}</p>
          </>
        )}
      </div>

      <CreateBucketSheet open={creating} onClose={() => setCreating(false)} onCreated={refreshBuckets} />

      {pendingDelete && (
        <ConfirmSheet
          open
          onOpenChange={(o) => !o && setPendingDelete(null)}
          title={pendingDelete.kind === 'bucket' ? t('storage.deleteBucketTitle', { name: pendingDelete.name }) : pendingDelete.label}
          description={
            pendingDelete.kind === 'bucket'
              ? t('storage.deleteBucketBody')
              : pendingDelete.paths.length === 1 ? t('storage.deleteFileBody') : t('storage.deleteManyBody')
          }
          actionLabel={pendingDelete.kind === 'bucket' ? t('storage.deleteBucketAction') : t('common.delete')}
          confirmText={pendingDelete.kind === 'bucket' ? pendingDelete.name : undefined}
          onConfirm={async () => {
            if (pendingDelete.kind === 'bucket') {
              await call('storage.deleteBucket', { ...input, name: pendingDelete.name })
              setBucket(null)
              await refreshBuckets()
            } else {
              await call('storage.delete', { ...input, bucket: bucket!, paths: pendingDelete.paths })
              setSelected(new Set())
              await refreshObjects()
            }
          }}
        />
      )}

      <ConfirmSheet
        open={pendingUpload}
        onOpenChange={setPendingUpload}
        title={t('storage.protectedTitle', { name: project.name })}
        description={t('storage.protectedBody')}
        actionLabel={t('storage.upload')}
        tone="primary"
        onConfirm={() => { upload.mutate() }}
      />
    </SplitView>
  )
}

function CreateBucketSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation()
  const project = useWorkspaceProject()
  const [name, setName] = useState('')
  const [isPublic, setPublic] = useState(false)
  const create = useMutation({
    mutationFn: () => call('storage.createBucket', { connectionId: project.connectionId, name: name.trim(), public: isPublic }),
    onSuccess: () => {
      onCreated()
      setName('')
      setPublic(false)
      onClose()
    },
  })

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && !create.isPending && onClose()}
      title={t('storage.createBucketTitle')}
      description={t('storage.createBucketBody')}
      footer={
        <>
          <button className="btn-secondary" disabled={create.isPending} onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn-primary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending && <Spinner className="!text-current" />}
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">{t('storage.bucketName')}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </div>
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-[14px] text-surface-100">{t('storage.makePublic')}</span>
            <span className="block text-[12.5px] text-surface-500">{t('storage.makePublicHint')}</span>
          </span>
          <Switch label={t('storage.makePublic')} checked={isPublic} onChange={setPublic} />
        </label>
        {create.error && <Notice tone="error">{create.error.message}</Notice>}
      </div>
    </Sheet>
  )
}
