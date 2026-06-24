import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { startAnalysis, getStatus } from '../api.js';
import { Loader2, CheckCircle2, XCircle, Sparkles, ArrowLeft, Clock } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

export default function Analysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('init');
  const [error, setError] = useState('');
  const [polling, setPolling] = useState(false);
  // Prevent double startAnalysis from StrictMode double-effect or race conditions
  const analysisStarted = useRef(false);

  // Trigger analysis on mount
  useEffect(() => {
    let cancelled = false;
    const trigger = async () => {
      try {
        // First check current status — auto mode may already be running
        const statusRes = await getStatus(id);
        if (cancelled) return;
        if (statusRes.success) {
          const currentStatus = statusRes.data.status;
          if (currentStatus === 'running' || currentStatus === 'auto_detecting') {
            // Auto mode: auto-detection or analysis already in progress, just poll
            setStatus('running');
            setPolling(true);
            return;
          }
          if (currentStatus === 'completed') {
            setStatus('completed');
            return;
          }
          if (currentStatus === 'failed' || currentStatus === 'auto_failed') {
            setStatus('failed');
            setError(statusRes.data.errorMessage || '分析失败');
            return;
          }
          if (currentStatus === 'annotated') {
            // Prevent double trigger from StrictMode double-effect
            if (analysisStarted.current) return;
            analysisStarted.current = true;

            // Manual mode: annotated but not yet started, trigger now
            const res = await startAnalysis(id);
            if (cancelled) return;
            if (res.success) {
              setStatus('running');
              setPolling(true);
            } else {
              setStatus('failed');
              setError(res.msg || '启动分析失败');
            }
            return;
          }
        }

        // Fallback: try to trigger analysis (only if not already started)
        if (analysisStarted.current) return;
        analysisStarted.current = true;
        const res = await startAnalysis(id);
        if (cancelled) return;
        if (res.success) {
          setStatus('running');
          setPolling(true);
        } else {
          setStatus('failed');
          setError(res.msg || '启动分析失败');
        }
      } catch (err) {
        if (cancelled) return;
        setStatus('failed');
        setError(err.response?.data?.msg || err.message);
      }
    };
    trigger();
    return () => { cancelled = true; };
  }, [id]);

  // Normalize backend status to UI status
  const normalizeStatus = (backendStatus) => {
    // In-progress states → show as running
    if (backendStatus === 'auto_detecting' || backendStatus === 'annotated' || backendStatus === 'running') {
      return 'running';
    }
    // Terminal states
    if (backendStatus === 'completed') return 'completed';
    if (backendStatus === 'auto_failed') return 'failed';
    return backendStatus;
  };

  // Poll status
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const res = await getStatus(id);
        if (res.success) {
          const backendStatus = res.data.status;
          setStatus(normalizeStatus(backendStatus));
          setError(res.data.errorMessage || '');
          if (backendStatus === 'completed') {
            setPolling(false);
            clearInterval(interval);
          } else if (backendStatus === 'failed' || backendStatus === 'auto_failed') {
            setPolling(false);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, id]);

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center px-4">
      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/batch')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#334155] transition-all cursor-pointer"
            title="返回批量进度"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">返回</span>
          </button>
          <span className="text-xl font-bold text-white">AI 分析</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/history')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#334155] transition-all cursor-pointer"
            title="查看历史记录"
          >
            <Clock className="w-4 h-4" />
            <span className="text-sm font-medium">历史记录</span>
          </button>
          <div className="flex items-center gap-2 text-[#94a3b8] text-sm">
            步骤 <span className="text-[#6366f1] font-bold">3</span>/3
          </div>
          <UserMenu />
        </div>
      </div>
      <div className="fixed top-16 left-0 right-0 h-1 bg-[#1e293b]">
        <div className="h-full w-full bg-gradient-to-r from-[#6366f1] to-[#a78bfa]" />
      </div>

      {/* Status card */}
      <div className="mt-24 max-w-md w-full">
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-8 text-center space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            {status === 'running' || status === 'init' ? (
              <div className="w-20 h-20 rounded-full bg-[#6366f1]/20 flex items-center justify-center animate-pulse">
                <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
              </div>
            ) : status === 'completed' ? (
              <div className="w-20 h-20 rounded-full bg-[#22c55e]/20 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-[#22c55e]" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#ef4444]/20 flex items-center justify-center">
                <XCircle className="w-10 h-10 text-[#ef4444]" />
              </div>
            )}
          </div>

          {/* Status text */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white">
              {status === 'init' ? '启动分析...' :
               status === 'running' ? '正在分析视频' :
               status === 'completed' ? '分析完成' :
               '分析失败'}
            </h2>
            <p className="text-[#94a3b8]">
              {status === 'running' ? 'AI 正在处理您的视频，这可能需要数分钟时间' :
               status === 'completed' ? '您可以查看分析结果了' :
               status === 'failed' ? error || '分析过程中发生错误' :
               '正在连接分析引擎...'}
            </p>
          </div>

          {/* Animated progress dots */}
          {(status === 'running' || status === 'init') && (
            <div className="flex justify-center gap-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-2.5 h-2.5 rounded-full bg-[#6366f1] animate-bounce"
                  style={{ animationDelay: `${i * 0.2}s` }}
                />
              ))}
            </div>
          )}

          {/* Actions */}
          {status === 'completed' && (
            <button
              onClick={() => navigate(`/results/${id}`)}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-white font-bold flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#22c55e]/30 transition-all cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              查看分析结果
            </button>
          )}

          {status === 'failed' && (
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 rounded-xl bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] font-medium transition-colors cursor-pointer"
            >
              返回首页重试
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
