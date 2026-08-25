import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import RequireRole from './components/RequireRole'
import Layout from './components/Layout'
import AdminLayout from './components/AdminLayout'
import Login from './pages/Login'
import SystemConfig from './pages/SystemConfig'
import Companies from './pages/Companies'
import TaskMonitoring from './pages/TaskMonitoring'
import CompanyRegistration from './pages/CompanyRegistration'
import Kiosk from './pages/Kiosk'
import KioskSetup from './pages/KioskSetup'
import Dashboard from './pages/Dashboard'
import TimeKeeping from './pages/TimeKeeping'
import Tasks from './pages/Tasks'
import Payroll from './pages/Payroll'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<CompanyRegistration />} />

        <Route element={<RequireRole role="administrator"><AdminLayout /></RequireRole>}>
          <Route path="/companies" element={<Companies />} />
          <Route path="/task-monitoring" element={<TaskMonitoring />} />
          <Route path="/settings" element={<SystemConfig />} />
          <Route path="/kiosk-setup" element={<KioskSetup />} />
        </Route>

        <Route path="/kiosk" element={<RequireRole role="employee"><Kiosk /></RequireRole>} />

        <Route element={<RequireRole roles={['employee', 'ceo']}><Layout /></RequireRole>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timekeeping" element={<TimeKeeping />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/payroll" element={<Payroll />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}
