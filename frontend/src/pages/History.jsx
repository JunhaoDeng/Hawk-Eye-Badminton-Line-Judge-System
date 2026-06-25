import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAnalysisList, deleteAnalysis } from '../api.js';
import { Trash2, Eye, RefreshCw, Loader2, Clock, User, Users, CheckCircle2, XCircle, Loader as LoaderIcon, Sparkles, Zap, MousePointer2 } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

const STATUS_MAP = {
  pending: { label: '待标注', color: '#f59e0b', icon: Clock },
  auto_detecting: { label: '自动标注中', color: '#22c55e', icon: LoaderIcon },
  auto_failed: { label: '自动标注失败', color: '#ef4444', icon: XCircle },
  annotated: { label: '已标注', color: '#3b82f6', icon: Clock },
  running: { label: '分析中', color: '#6366f1', icon: LoaderIcon },
  completed: { label: '已完成', color: '#22c55e', icon: CheckCircle2 },
  failed: { label: '失败', color: '#ef4444', icon: XCircle },
};

export default function History() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState('all');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const fetchList = async () => {
      setLoading(true);
      try {
        const res = await getAnalysisList(page, 20);
        if (res.success) {
          setList(res.data.list || []);
          setTotal(res.data.total);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchList();
  }, [page]);

  const handleView = async (item) => {
    if (item.status === 'completed') {
      navigate(`/results/${item._id}`);
    } else if (item.status === 'pending' || item.status === 'auto_failed') {
      navigate(`/annotate/${item._id}`);
    } else if (item.status === 'annotated') {
      navigate(`/analysis/${item._id}`);
    } else if (item.status === 'running' || item.status === 'auto_detecting') {
      navigate(`/analysis/${item._id}`);
    } else if (item.status === 'failed') {
      navigate(`/annotate/${item._id}`);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try {
      const res = await deleteAnalysis(id);
      if (res.success) {
        setList(list.filter(item => item._id !== id));
        setTotal(total - 1);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(null);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const filtered = filterMode === 'all' ? list : list.filter(item => item.mode === filterMode);
  const totalPages = Math.ceil(total / 20);

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-[#a78bfa]" />
          <span className="text-xl font-bold text-white">历史记录</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-medium hover:shadow-lg hover:shadow-[#6366f1]/30 transition-all cursor-pointer"
          >
            新建分析
          </button>
          <UserMenu />
        </div>
      </nav>

      <main className="flex-1 pt-20 px-4 lg:px-6 pb-8 space-y-6">
        {/* Filters */}
        <div className="flex gap-3">
          {['all', 'singles', 'doubles'].map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                filterMode === mode
                  ? 'bg-[#6366f1]/20 border border-[#6366f1] text-[#a78bfa]'
                  : 'bg-[#1e293b] border border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              {mode === 'all' ? '全部' : mode === 'singles' ? '单打' : '双打'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-[#94a3b8]">
              暂无分析记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#334155]">
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">视频名</th>
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">模式</th>
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">标注</th>
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">状态</th>
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">处理时长</th>
                    <th className="px-4 py-3 text-left text-[#94a3b8] text-xs font-semibold uppercase">时间</th>
                    <th className="px-4 py-3 text-right text-[#94a3b8] text-xs font-semibold uppercase">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const st = STATUS_MAP[item.status] || STATUS_MAP.pending;
                    const Icon = st.icon;
                    const annotationMode = item.annotationMode || 'manual';
                    return (
                      <tr key={item._id} className="border-b border-[#334155]/50 hover:bg-[#334155]/30 transition-colors">
                        <td className="px-4 py-3 text-[#f8fafc] font-medium">{item.videoName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                            item.mode === 'doubles'
                              ? 'bg-[#6366f1]/20 text-[#a78bfa]'
                              : 'bg-[#22c55e]/20 text-[#22c55e]'
                          }`}>
                            {item.mode === 'doubles' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {item.mode === 'doubles' ? '双打' : '单打'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                            annotationMode === 'auto'
                              ? 'bg-[#22c55e]/20 text-[#4ade80]'
                              : 'bg-[#f59e0b]/20 text-[#fbbf24]'
                          }`}>
                            {annotationMode === 'auto' ? <Zap className="w-3 h-3" /> : <MousePointer2 className="w-3 h-3" />}
                            {annotationMode === 'auto' ? '自动' : '手动'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: st.color }}>
                            {item.status === 'running' || item.status === 'auto_detecting' ? <Icon className="w-3 h-3 animate-spin" /> : <Icon className="w-3 h-3" />}
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#94a3b8] text-xs">
                          {item.status === 'running' || item.status === 'auto_detecting'
                            ? <span className="inline-flex items-center gap-1 text-[#6366f1]"><Loader2 className="w-3 h-3 animate-spin" />计算中</span>
                            : formatDuration(item.processingTime)
                          }
                        </td>
                        <td className="px-4 py-3 text-[#94a3b8] text-xs">
                          {new Date(item.create_at).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => handleView(item)}
                              className="px-3 py-1.5 rounded-lg bg-[#6366f1]/20 hover:bg-[#6366f1]/30 text-[#a78bfa] text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              查看
                            </button>
                            <button
                              onClick={() => handleDelete(item._id)}
                              disabled={deleting === item._id}
                              className="px-3 py-1.5 rounded-lg bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] text-xs font-medium transition-colors flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                            >
                              {deleting === item._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  p === page
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#1e293b] text-[#94a3b8] hover:bg-[#334155]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
