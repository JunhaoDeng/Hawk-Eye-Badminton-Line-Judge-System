import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, LogOut } from 'lucide-react'

export default function UserMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const email = localStorage.getItem('userEmail') || ''

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('userEmail')
    navigate('/login')
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#e2e8f0] hover:bg-[#334155] transition-all cursor-pointer"
        title={email}
      >
        <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-[#a78bfa]" />
        </div>
        <span className="text-sm font-medium max-w-[120px] truncate hidden sm:inline">
          {email}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[#1e293b] border border-[#334155] rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#334155]">
            <p className="text-xs text-[#64748b]">当前用户</p>
            <p className="text-sm text-white truncate">{email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}
