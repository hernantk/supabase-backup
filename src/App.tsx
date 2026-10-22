import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SidebarNav } from './components/SidebarNav'
import { TitleBar } from './components/TitleBar'
import { Dashboard } from './pages/Dashboard'
import { RunBackup } from './pages/RunBackup'
import { Backups } from './pages/Backups'
import { Accounts } from './pages/Accounts'
import { Restore } from './pages/Restore'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'
import { BackupProvider } from './contexts/BackupContext'
import { JobsProvider } from './contexts/JobsContext'
import { BackupMiniProgress } from './components/BackupMiniProgress'

export default function App() {
  return (
    <HashRouter>
      <JobsProvider>
      <BackupProvider>
        <div className="h-screen flex overflow-hidden bg-surface-950">
          <SidebarNav />
          <div className="flex-1 min-w-0 flex flex-col">
            <TitleBar />
            <main className="flex-1 min-w-0 overflow-y-auto px-8 pb-10 lg:px-12">
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/backups" element={<Backups />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/backup" element={<RunBackup />} />
                <Route path="/restore" element={<Restore />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs />} />
              </Routes>
            </main>
          </div>
        </div>
        <BackupMiniProgress />
      </BackupProvider>
      </JobsProvider>
    </HashRouter>
  )
}
