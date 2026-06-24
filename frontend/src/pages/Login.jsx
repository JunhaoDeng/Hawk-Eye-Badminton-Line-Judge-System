import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, register } from '../api.js'
import { Sparkles, Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const fn = isRegister ? register : login
      const res = await fn(email, password)
      if (res.success) {
        localStorage.setItem('token', res.data.token)
        localStorage.setItem('userEmail', res.data.email)
        navigate('/')
      } else {
        setError(res.msg)
      }
    } catch (err) {
      setError(err.response?.data?.msg || '请求失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -right-[5%] w-[40%] h-[60%] bg-[#6366f1]/5 rounded-full blur-[120px]" />
        <div className="absolute top-[20%] -left-[10%] w-[30%] h-[50%] bg-[#a78bfa]/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md z-10">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-14 h-14 mb-5 bg-gradient-to-br from-[#6366f1] to-[#a78bfa] rounded-xl flex items-center justify-center shadow-lg shadow-[#6366f1]/25">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
            羽毛球分析系统
          </h1>
          <p className="text-sm text-[#94a3b8] font-medium">
            基于计算机视觉的比赛视频分析工具
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#1e293b] p-8 rounded-xl border border-[#334155] shadow-xl">
          {error && (
            <div className="mb-5 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider ml-1">
                邮箱
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#64748b]">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-11 pr-4 py-3 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider ml-1">
                密码
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#64748b]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-12 py-3 bg-[#0f172a] border border-[#334155] rounded-lg text-white placeholder-[#475569] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-[#64748b] hover:text-[#94a3b8] transition-colors"
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#6366f1] to-[#a78bfa] text-white py-3.5 rounded-lg font-bold text-base shadow-lg shadow-[#6366f1]/20 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? '请稍候...' : isRegister ? '注册' : '登录'}
            </button>
          </form>

          {/* Toggle */}
          <div className="mt-7 pt-6 border-t border-[#334155] text-center">
            <p className="text-sm text-[#94a3b8]">
              {isRegister ? '已有账号？' : '没有账号？'}
              <button
                onClick={() => { setIsRegister(!isRegister); setError('') }}
                className="font-semibold text-[#a78bfa] hover:text-[#c4b5fd] transition-colors ml-1"
              >
                {isRegister ? '去登录' : '注册账号'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
