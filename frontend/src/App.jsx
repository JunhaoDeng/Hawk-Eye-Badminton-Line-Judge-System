import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Upload from './pages/Upload.jsx'
import Annotate from './pages/Annotate.jsx'
import Analysis from './pages/Analysis.jsx'
import Results from './pages/Results.jsx'
import History from './pages/History.jsx'
import BatchProgress from './pages/BatchProgress.jsx'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Upload /></PrivateRoute>} />
        <Route path="/annotate/:id" element={<PrivateRoute><Annotate /></PrivateRoute>} />
        <Route path="/analysis/:id" element={<PrivateRoute><Analysis /></PrivateRoute>} />
        <Route path="/results/:id" element={<PrivateRoute><Results /></PrivateRoute>} />
        <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
        <Route path="/batch" element={<PrivateRoute><BatchProgress /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
