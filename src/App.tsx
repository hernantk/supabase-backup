import { useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SidebarNav } from './components/SidebarNav'
import { TitleBar } from './components/TitleBar'
import { BackupMiniProgress } from './components/BackupMiniProgress'
import { JobsProvider } from './contexts/JobsContext'
import { useConfig } from './hooks/useConfig'
import { useManagerChangeSync } from './lib/api'
import { setLanguage } from './i18n'
import { Dashboard } from './pages/Dashboard'
import { Projects } from './pages/Projects'
import { Backups } from './pages/Backups'
import { Accounts } from './pages/Accounts'
import { Restore } from './pages/Restore'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'
import { ProjectWorkspace } from './pages/project/ProjectWorkspace'
import { Overview } from './pages/project/Overview'
import { SqlEditor } from './pages/project/SqlEditor'
import { TableEditor } from './pages/project/TableEditor'
import { AuthUsers } from './pages/project/AuthUsers'
import { Functions } from './pages/project/Functions'
import { ProjectLogs } from './pages/project/ProjectLogs'
import { Schema } from './pages/project/Schema'
import { StorageBrowser } from './pages/project/StorageBrowser'
import { ProjectBackups } from './pages/project/ProjectBackups'
import { SecretsKeys } from './pages/project/SecretsKeys'

function Shell() {
  const { data: config } = useConfig()
  useManagerChangeSync()

  // The language preference lives in the config; "system" follows the OS.
  useEffect(() => {
    if (config) setLanguage(config.settings.language)
  }, [config?.settings.language]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="h-screen flex overflow-hidden bg-surface-950">
        <SidebarNav />
        <div className="flex-1 min-w-0 flex flex-col">
          <TitleBar />
          <main className="flex-1 min-w-0 overflow-y-auto px-8 pb-10 lg:px-12">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/p/:id" element={<ProjectWorkspace />}>
                <Route index element={<Overview />} />
                <Route path="sql" element={<SqlEditor />} />
                <Route path="tables" element={<TableEditor />} />
                <Route path="auth" element={<AuthUsers />} />
                <Route path="storage" element={<StorageBrowser />} />
                <Route path="functions" element={<Functions />} />
                <Route path="logs" element={<ProjectLogs />} />
                <Route path="schema" element={<Schema />} />
                <Route path="backups" element={<ProjectBackups />} />
                <Route path="secrets" element={<SecretsKeys />} />
              </Route>
              <Route path="/backups" element={<Backups />} />
              <Route path="/restore" element={<Restore />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      <BackupMiniProgress />
    </>
  )
}

export default function App() {
  return (
    <HashRouter>
      <JobsProvider>
        <Shell />
      </JobsProvider>
    </HashRouter>
  )
}
