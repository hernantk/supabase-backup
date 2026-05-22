import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SidebarNav } from './components/SidebarNav'
import { TitleBar } from './components/TitleBar'
import { Dashboard } from './pages/Dashboard'
import { RunBackup } from './pages/RunBackup'
import { Settings } from './pages/Settings'
import { Logs } from './pages/Logs'

export default function App() {
  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col overflow-hidden">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <SidebarNav />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/backup" element={<RunBackup />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/logs" element={<Logs />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
