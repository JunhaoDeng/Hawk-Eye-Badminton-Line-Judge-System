import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { batchStatus } from '../api.js';
import { Sparkles, Loader2, CheckCircle2, XCircle, Zap, MousePointer2, Clock, Eye, AlertCircle, ArrowLeft } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

const STATUS_CONFIG = {
  pending: { label: '待标注', color: '#f59e0b', icon: Clock },
  auto_detecting: { label: '自动标注中', color: '#22c55e', icon: Loader2 },
  auto_failed: { label: '自动标注失败', color: '#ef4444', icon: XCircle },
  annotated: { label: '已标注', color: '#3b82f6', icon: Clock },
  running: { label: '分析中', color: '#6366f1', icon: Loader2 },
  completed: { label: '已完成', color: '#22c55e', icon: CheckCircle2 },
  failed: { label: '失败', color: '#ef4444', icon: XCircle },
};

export default function BatchProgress() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ids, setIds] = useState([]);

  useEffect(() => {
    // Get batch IDs from sessionStorage
    const stored = sessionStorage.getItem('batchIds');
    if (!stored) {
      navigate('/');
      return;
    }
    const parsed = JSON.parse(stored);
    setIds(parsed);
  }, [navigate]);

  // Poll status every 3 seconds
  useEffect(() => {
    if (ids.length === 0) return;

    const poll = async () => {
      try {
        const res = await batchStatus(ids);
        if (res.success) {
          setRecords(res.data.records);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [ids]);

  const completedCount = records.filter(r => r.status === 'completed').length;
  const failedCount = records.filter(r => r.status === 'failed' || r.status === 'auto_failed').length;
  const allDone = records.length > 0 && completedCount + failedCount === records.length;

  const handleView = (record) => {
    if (record.status === 'completed') {
      navigate(`/results/${record.id}`);
    } else if (record.status === 'auto_failed' || record.status === 'pending') {
      navigate(`/annotate/${record.id}`);
    } else if (record.status === 'failed') {
      navigate(`/annotate/${record.id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[#94a3b8] hover:text-white hover:bg-[#334155] transition-all cursor-pointer"
            title="返回首页"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm font-medium">返回</span>
          </button>
          <Sparkles className="w-6 h-6 text-[#a78bfa]" />
          <span className="text-xl font-bold text-white">批量分析进度</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[#94a3b8] text-sm">
            已完成 <span className="text-[#22c55e] font-bold">{completedCount}</span> / {records.length}
          </span>
          <button
            onClick={() => navigate('/history')}
            className="px-4 py-2 rounded-lg bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] text-sm font-medium transition-colors cursor-pointer"
          >
            历史记录
          </button>
          <UserMenu />
        </div>
      </nav>

      <main className="flex-1 pt-20 px-4 lg:px-6 pb-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Progress summary */}
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-[#f8fafc]">处理概览</h2>
            <div className="flex items-center gap-2 text-sm">
              {allDone ? (
                <span className="text-[#22c55e] font-semibold">全部完成</span>
              ) : (
                <span className="text-[#94a3b8]">处理中...</span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-3 bg-[#334155] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#6366f1] to-[#a78bfa] rounded-full transition-all duration-500"
              style={{ width: `${(completedCount / records.length) * 100}%` }}
            />
          </div>

          <div className="flex gap-6 mt-4 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#22c55e]" />
              <span className="text-[#94a3b8]">已完成 {completedCount}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#6366f1] animate-pulse" />
              <span className="text-[#94a3b8]">进行中 {records.length - completedCount - failedCount}</span>
            </div>
            {failedCount > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#ef4444]" />
                <span className="text-[#94a3b8]">失败 {failedCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Records list */}
        <div className="space-y-3">
          {records.map((record) => {
            const st = STATUS_CONFIG[record.status] || STATUS_CONFIG.pending;
            const Icon = st.icon;
            return (
              <div key={record.id} className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 flex items-center justify-between hover:border-[#475569] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    record.status === 'completed' ? 'bg-[#22c55e]/20' :
                    record.status === 'failed' || record.status === 'auto_failed' ? 'bg-[#ef4444]/20' :
                    'bg-[#6366f1]/20'
                  }`}>
                    {record.status === 'running' || record.status === 'auto_detecting' ? (
                      <Icon className="w-5 h-5 animate-spin" style={{ color: st.color }} />
                    ) : (
                      <Icon className="w-5 h-5" style={{ color: st.color }} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[#f8fafc] font-semibold truncate">{record.videoName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded-md" style={{ color: st.color, background: `${st.color}20` }}>
                        {st.label}
                      </span>
                      {record.annotationMode === 'auto' && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-[#22c55e]/20 text-[#4ade80] flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          自动
                        </span>
                      )}
                      {record.annotationMode === 'manual' && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-md bg-[#f59e0b]/20 text-[#fbbf24] flex items-center gap-1">
                          <MousePointer2 className="w-3 h-3" />
                          手动
                        </span>
                      )}
                      {record.errorMessage && (
                        <span className="text-[#94a3b8] text-xs truncate max-w-[200px]">{record.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(record.status === 'completed' || record.status === 'auto_failed' || record.status === 'pending' || record.status === 'failed') && (
                    <button
                      onClick={() => handleView(record)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#6366f1]/20 hover:bg-[#6366f1]/30 text-[#a78bfa] text-xs font-medium transition-colors cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      {record.status === 'completed' ? '查看结果' : '手动标注'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* All done action */}
        {allDone && (
          <div className="text-center pt-4">
            <button
              onClick={() => navigate('/history')}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-white font-bold text-lg shadow-lg shadow-[#22c55e]/30 hover:shadow-[#22c55e]/50 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto"
            >
              <Sparkles className="w-5 h-5" />
              查看所有结果
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
