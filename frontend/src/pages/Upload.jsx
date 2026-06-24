import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadVideo, batchUpload } from '../api.js';
import { Play, Users, User, UploadCloud, Loader2, History, Sparkles, Zap, MousePointer2, X, FileVideo, Cpu } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

export default function Upload() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('singles');
  const [annotationMode, setAnnotationMode] = useState('auto');
  const [device, setDevice] = useState('cpu');
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (dropped.length > 0) setFiles([...files, ...dropped]);
  };

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files).filter(f => f.type.startsWith('video/'));
    if (selected.length > 0) setFiles([...files, ...selected]);
    e.target.value = '';
  };

  const removeFile = (index) => setFiles(files.filter((_, i) => i !== index));

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);

    try {
      if (files.length === 1) {
        // Single file upload
        const formData = new FormData();
        formData.append('file', files[0]);
        formData.append('mode', mode);
        formData.append('annotationMode', annotationMode);
        formData.append('device', device);
        const res = await uploadVideo(formData);
        if (res.success) {
          if (annotationMode === 'auto') {
            navigate(`/analysis/${res.data.id}`);
          } else {
            navigate(`/annotate/${res.data.id}`);
          }
        } else {
          alert(res.msg || '上传失败');
        }
      } else {
        // Batch upload
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('mode', mode);
        formData.append('annotationMode', annotationMode);
        formData.append('device', device);
        const res = await batchUpload(formData);
        if (res.success) {
          const ids = res.data.records.map(r => r.id);
          // Store IDs in sessionStorage for BatchProgress page
          sessionStorage.setItem('batchIds', JSON.stringify(ids));
          navigate(`/batch`);
        } else {
          alert(res.msg || '批量上传失败');
        }
      }
    } catch (err) {
      console.error(err);
      alert('上传失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-[#a78bfa]" />
          <span className="text-xl font-bold text-white tracking-wide">Badminton AI</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] transition-colors cursor-pointer"
          >
            <History className="w-4 h-4" />
            <span className="text-sm font-medium">历史记录</span>
          </button>
          <UserMenu />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center pt-20 px-4 pb-8">
        <div className="max-w-xl w-full space-y-8">
          {/* Hero */}
          <div className="text-center space-y-3">
            <h1 className="text-3xl font-bold text-white">
              羽毛球视频 <span className="text-[#a78bfa]">AI</span> 分析
            </h1>
            <p className="text-[#94a3b8] text-base">
              上传比赛视频，自动标注球场角点，一键生成分析报告
            </p>
          </div>

          {/* Mode selector */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setMode('singles')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                mode === 'singles'
                  ? 'bg-[#6366f1]/20 border-[#6366f1] text-[#a78bfa] shadow-lg shadow-[#6366f1]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <User className="w-5 h-5" />
              <span className="font-semibold">单打</span>
            </button>
            <button
              onClick={() => setMode('doubles')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                mode === 'doubles'
                  ? 'bg-[#6366f1]/20 border-[#6366f1] text-[#a78bfa] shadow-lg shadow-[#6366f1]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <Users className="w-5 h-5" />
              <span className="font-semibold">双打</span>
            </button>
          </div>

          {/* Device selector — CPU / MPS (Apple GPU) */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setDevice('cpu')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                device === 'cpu'
                  ? 'bg-[#3b82f6]/20 border-[#3b82f6] text-[#60a5fa] shadow-lg shadow-[#3b82f6]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <Cpu className="w-5 h-5" />
              <span className="font-semibold">CPU</span>
            </button>
            <button
              onClick={() => setDevice('mps')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                device === 'mps'
                  ? 'bg-[#f59e0b]/20 border-[#f59e0b] text-[#fbbf24] shadow-lg shadow-[#f59e0b]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <Zap className="w-5 h-5" />
              <span className="font-semibold">MPS GPU</span>
            </button>
          </div>
          {device === 'mps' && (
            <p className="text-center text-[#fbbf24] text-xs -mt-4">
              YOLO 模型使用 Apple GPU 加速，姿态估计仍用 CPU（ONNX 限制）
            </p>
          )}

          {/* Annotation mode selector */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => setAnnotationMode('auto')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                annotationMode === 'auto'
                  ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#4ade80] shadow-lg shadow-[#22c55e]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span className="font-semibold text-sm">自动标注</span>
            </button>
            <button
              onClick={() => setAnnotationMode('manual')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border-2 transition-all cursor-pointer ${
                annotationMode === 'manual'
                  ? 'bg-[#f59e0b]/20 border-[#f59e0b] text-[#fbbf24] shadow-lg shadow-[#f59e0b]/20'
                  : 'bg-[#1e293b] border-[#334155] text-[#94a3b8] hover:border-[#475569]'
              }`}
            >
              <MousePointer2 className="w-4 h-4" />
              <span className="font-semibold text-sm">手动标注</span>
            </button>
          </div>

          {/* Upload area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 rounded-2xl p-8 text-center transition-all ${
              dragActive
                ? 'border-[#6366f1] bg-[#6366f1]/10 scale-[1.02]'
                : files.length > 0
                  ? 'border-[#22c55e] bg-[#22c55e]/10'
                  : 'border-[#334155] bg-[#1e293b] hover:border-[#475569]'
            }`}
          >
            {files.length === 0 ? (
              <div className="space-y-4">
                <UploadCloud className="w-16 h-16 text-[#6366f1] mx-auto opacity-60" />
                <p className="text-[#e2e8f0] font-semibold">
                  拖拽视频文件到此处
                </p>
                <p className="text-[#94a3b8] text-sm">支持批量上传，一次最多20个文件</p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#8b5cf6] text-white font-medium transition-colors cursor-pointer">
                  <UploadCloud className="w-4 h-4" />
                  选择视频
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <FileVideo className="w-12 h-12 text-[#22c55e] mx-auto" />
                <p className="text-[#f8fafc] font-semibold">已选择 {files.length} 个文件</p>
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {files.map((f, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[#0f172a] rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileVideo className="w-4 h-4 text-[#6366f1]" />
                        <span className="text-[#e2e8f0] text-sm truncate">{f.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#94a3b8] text-xs">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                        <button
                          onClick={() => removeFile(idx)}
                          className="text-[#94a3b8] hover:text-[#ef4444] transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] text-sm font-medium transition-colors cursor-pointer">
                  <UploadCloud className="w-3.5 h-3.5" />
                  继续添加
                  <input
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleUpload}
            disabled={files.length === 0 || uploading}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
              !files.length || uploading
                ? 'bg-[#334155] text-[#737785] cursor-not-allowed'
                : annotationMode === 'auto'
                  ? 'bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-white hover:from-[#4ade80] hover:to-[#86efac] shadow-lg shadow-[#22c55e]/30 cursor-pointer'
                  : 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:from-[#8b5cf6] hover:to-[#a78bfa] shadow-lg shadow-[#6366f1]/30 cursor-pointer'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                上传中...
              </>
            ) : annotationMode === 'auto' ? (
              <>
                <Zap className="w-5 h-5" />
                {files.length > 1 ? '批量上传并自动分析' : '上传并自动分析'}
              </>
            ) : (
              <>
                <MousePointer2 className="w-5 h-5" />
                上传并手动标注
              </>
            )}
          </button>

          {/* Info */}
          <p className="text-center text-[#94a3b8] text-xs">
            支持 MP4、AVI、MOV 等常见视频格式 · 自动标注可随时回退手动标注
          </p>
        </div>
      </main>
    </div>
  );
}
