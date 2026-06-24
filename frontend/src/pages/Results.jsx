import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getResults, downloadResults } from '../api.js';
import { Play, Image, X, Loader2, ChevronLeft, Grid3x3, Download } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

export default function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const res = await getResults(id);
        if (res.success) {
          setData(res.data);
        } else {
          alert(res.msg || '获取结果失败');
          navigate('/history');
        }
      } catch (err) {
        console.error(err);
        navigate('/history');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const modeLabel = data.mode === 'doubles' ? '双打' : '单打';

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <button
          onClick={() => navigate('/history')}
          className="flex items-center gap-2 text-[#e2e8f0] hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-semibold">返回历史</span>
        </button>
        <div className="flex items-center gap-3">
          <span className="text-[#f8fafc] font-bold">{data.videoName}</span>
          <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
            data.mode === 'doubles'
              ? 'bg-[#6366f1]/20 text-[#a78bfa]'
              : 'bg-[#22c55e]/20 text-[#22c55e]'
          }`}>
            {modeLabel}
          </span>
          <a
            href={downloadResults(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6366f1]/10 border border-[#6366f1]/30 text-[#a78bfa] hover:bg-[#6366f1]/20 hover:border-[#6366f1]/50 transition-all text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            打包下载
          </a>
          <UserMenu />
        </div>
      </nav>

      <main className="flex-1 pt-16 px-4 lg:px-6 pb-8 space-y-6">
        {/* Video player */}
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] overflow-hidden">
          <div className="p-3 border-b border-[#334155] flex items-center gap-2">
            <Play className="w-4 h-4 text-[#6366f1]" />
            <span className="text-[#e2e8f0] font-semibold">分析视频</span>
          </div>
          <video
            src={data.videoUrl}
            controls
            className="w-full max-h-[480px] bg-black"
          >
            您的浏览器不支持视频播放
          </video>
        </div>

        {/* Heatmaps */}
        {data.heatmaps && data.heatmaps.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4 text-[#6366f1]" />
              <h3 className="text-[#e2e8f0] font-semibold">热力图</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {data.heatmaps.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedImage(url)}
                  className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden cursor-pointer hover:border-[#6366f1] transition-colors group"
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={url}
                      alt={`热力图 ${idx + 1}`}
                      className="w-full object-contain max-h-[200px] group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="p-2 text-xs text-[#94a3b8] truncate">
                    {url.split('/').pop()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scatter plots */}
        {data.scatterPlots && data.scatterPlots.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-[#8b5cf6]" />
              <h3 className="text-[#e2e8f0] font-semibold">散点图</h3>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {data.scatterPlots.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedImage(url)}
                  className="bg-[#1e293b] rounded-xl border border-[#334155] overflow-hidden cursor-pointer hover:border-[#8b5cf6] transition-colors group"
                >
                  <div className="relative overflow-hidden">
                    <img
                      src={url}
                      alt={`散点图 ${idx + 1}`}
                      className="w-full object-contain max-h-[200px] group-hover:scale-105 transition-transform"
                    />
                  </div>
                  <div className="p-2 text-xs text-[#94a3b8] truncate">
                    {url.split('/').pop()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Image modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-[#1e293b] border border-[#334155] flex items-center justify-center text-[#e2e8f0] hover:text-white cursor-pointer z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={selectedImage}
              alt="放大查看"
              className="max-w-full max-h-[90vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
