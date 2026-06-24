import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getTemplate, submitAnnotation, autoDetectPreview } from '../api.js';
import { ArrowRight, RotateCcw, Check, Loader2, MapPin, Zap, AlertCircle } from 'lucide-react';
import UserMenu from '../components/UserMenu.jsx';

const CORNER_LABELS = ['左上', '右上', '右下', '左下'];
const CORNER_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

export default function Annotate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [image, setImage] = useState(null);
  const [imageWidth, setImageWidth] = useState(0);
  const [imageHeight, setImageHeight] = useState(0);
  const [corners, setCorners] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false); // prevents double-submit from StrictMode
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  // Auto-detect state
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [autoCorners, setAutoCorners] = useState(null);
  const [autoConfidence, setAutoConfidence] = useState(0);
  const [autoError, setAutoError] = useState('');
  const [showAutoPreview, setShowAutoPreview] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = getTemplate(id);
    img.onload = () => {
      setImage(img);
      setImageWidth(img.naturalWidth);
      setImageHeight(img.naturalHeight);
      setLoading(false);
    };
    img.onerror = () => {
      setLoading(false);
      alert('模板图加载失败');
    };
  }, [id]);

  // Calculate scale to fit canvas
  useEffect(() => {
    if (!image || !containerRef.current) return;
    const container = containerRef.current;
    const maxW = container.clientWidth - 40;
    const maxH = container.clientHeight - 40;
    const s = Math.min(maxW / imageWidth, maxH / imageHeight, 1);
    setScale(s);
    setOffsetX((container.clientWidth - imageWidth * s) / 2);
    setOffsetY((container.clientHeight - imageHeight * s) / 2);
  }, [image, imageWidth, imageHeight]);

  // Draw canvas
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = containerRef.current.clientWidth;
    canvas.height = containerRef.current.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(image, offsetX, offsetY, imageWidth * scale, imageHeight * scale);

    // Determine which corners to draw
    const displayCorners = showAutoPreview && autoCorners ? autoCorners : corners;
    const isAutoPreview = showAutoPreview && autoCorners;

    // Draw corners
    displayCorners.forEach((corner, idx) => {
      const cx = offsetX + corner[0] * scale;
      const cy = offsetY + corner[1] * scale;

      // Circle
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, 2 * Math.PI);
      ctx.fillStyle = isAutoPreview ? '#22c55e' : CORNER_COLORS[idx];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Label
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${idx + 1}: ${CORNER_LABELS[idx]}`, cx + 12, cy - 8);
    });

    // Draw connecting lines
    if (displayCorners.length >= 2) {
      ctx.beginPath();
      ctx.strokeStyle = isAutoPreview ? '#22c55e' : '#22c55e';
      ctx.lineWidth = 2;
      if (isAutoPreview) {
        ctx.setLineDash([8, 4]);
      } else {
        ctx.setLineDash([]);
      }
      displayCorners.forEach((corner, idx) => {
        const cx = offsetX + corner[0] * scale;
        const cy = offsetY + corner[1] * scale;
        if (idx === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      if (displayCorners.length === 4) ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw guide text if not all corners set and not in auto preview
    if (!showAutoPreview && corners.length < 4) {
      const guideY = offsetY + 20;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(offsetX, guideY - 16, imageWidth * scale, 32);
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillStyle = '#f8fafc';
      const next = corners.length + 1;
      ctx.fillText(
        `请点击第 ${next} 个角点：${CORNER_LABELS[next - 1]}（共4个角点）`,
        offsetX + 12, guideY + 4
      );
    }

    // Draw auto preview info
    if (showAutoPreview && autoCorners) {
      const infoY = offsetY + 20;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(offsetX, infoY - 16, imageWidth * scale, 32);
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(
        `自动检测角点 · 置信度 ${autoConfidence}% · 点击"确认使用"直接提交`,
        offsetX + 12, infoY + 4
      );
    }
  }, [image, corners, scale, offsetX, offsetY, imageWidth, imageHeight, showAutoPreview, autoCorners, autoConfidence]);

  const handleCanvasClick = (e) => {
    if (showAutoPreview || corners.length >= 4) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const origX = Math.round((x - offsetX) / scale);
    const origY = Math.round((y - offsetY) / scale);

    if (origX < 0 || origX > imageWidth || origY < 0 || origY > imageHeight) return;

    setCorners([...corners, [origX, origY]]);
  };

  const handleReset = () => {
    setCorners([]);
    setShowAutoPreview(false);
    setAutoCorners(null);
    setAutoError('');
  };

  const handleAutoDetect = async () => {
    setAutoDetecting(true);
    setAutoError('');
    setShowAutoPreview(false);
    try {
      const res = await autoDetectPreview(id);
      if (res.success && res.data && res.data.success && res.data.corners && res.data.corners.length === 4) {
        setAutoCorners(res.data.corners);
        setAutoConfidence(Math.round((res.data.confidence || 0) * 100));
        setShowAutoPreview(true);
      } else {
        setAutoError(res.data?.error || '自动检测未找到角点');
      }
    } catch (err) {
      console.error('Auto preview error:', err);
      setAutoError('自动检测请求失败');
    } finally {
      setAutoDetecting(false);
    }
  };

  const handleUseAutoAsBase = () => {
    if (autoCorners && autoCorners.length === 4) {
      setCorners(autoCorners);
      setShowAutoPreview(false);
    }
  };

  const handleSubmit = async () => {
    if (corners.length !== 4) return;
    if (submittingRef.current) return; // prevent double-submit
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await submitAnnotation(id, corners);
      if (res.success) {
        navigate(`/analysis/${id}`);
      } else {
        alert(res.msg || '标注提交失败');
      }
    } catch (err) {
      console.error(err);
      alert('标注提交失败: ' + (err.response?.data?.msg || err.message));
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-[#0f172a] flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 h-16 bg-[#1e293b]/90 backdrop-blur-md border-b border-[#334155] flex items-center justify-between px-6 z-50">
        <span className="text-xl font-bold text-white">球场角点标注</span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[#94a3b8] text-sm">
            步骤 <span className="text-[#6366f1] font-bold">2</span>/3
          </div>
          <UserMenu />
        </div>
      </nav>

      <main className="flex-1 flex flex-col pt-16">
        {/* Progress bar */}
        <div className="h-1 bg-[#1e293b]">
          <div className="h-full w-2/3 bg-gradient-to-r from-[#6366f1] to-[#a78bfa]" />
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
          {/* Canvas area */}
          <div
            ref={containerRef}
            className="flex-1 relative bg-[#1e293b] rounded-2xl border border-[#334155] overflow-hidden min-h-[400px]"
          >
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
              </div>
            ) : (
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="absolute inset-0 cursor-crosshair"
              />
            )}
          </div>

          {/* Side panel */}
          <div className="w-full lg:w-72 space-y-4">
            {/* Auto detect button */}
            <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-3">
              <h3 className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#22c55e]" />
                快速标注
              </h3>

              {showAutoPreview ? (
                <>
                  <div className="flex items-center gap-2 bg-[#22c55e]/10 border border-[#22c55e]/30 rounded-lg p-2.5">
                    <Check className="w-4 h-4 text-[#22c55e] shrink-0" />
                    <span className="text-[#22c55e] text-xs font-medium">
                      自动检测完成 · 置信度 {autoConfidence}%
                    </span>
                  </div>
                  <button
                    onClick={handleUseAutoAsBase}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-white font-medium transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#22c55e]/30 cursor-pointer"
                  >
                    <ArrowRight className="w-4 h-4" />
                    使用自动标注
                  </button>
                  <p className="text-[#94a3b8] text-xs">
                    点击后自动角点将填入下方，可微调后点「确认并继续」提交
                  </p>
                </>
              ) : (
                <>
                  <button
                    onClick={handleAutoDetect}
                    disabled={autoDetecting || submitting}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#22c55e] to-[#4ade80] text-white font-medium transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#22c55e]/30 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {autoDetecting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {autoDetecting ? '正在检测...' : '自动检测角点'}
                  </button>
                  <p className="text-[#94a3b8] text-xs">
                    AI 自动识别球场角点位置，检测后可确认或微调
                  </p>
                </>
              )}
              {autoError && !showAutoPreview && (
                <div className="flex items-start gap-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-lg p-2.5">
                  <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
                  <p className="text-[#ef4444] text-xs">{autoError}</p>
                </div>
              )}
            </div>

            {/* Corner status */}
            <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4 space-y-3">
              <h3 className="font-semibold text-[#e2e8f0] flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#6366f1]" />
                角点状态
              </h3>
              {CORNER_LABELS.map((label, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    corners[idx]
                      ? `bg-[#6366f1] text-white`
                      : 'bg-[#334155] text-[#737785]'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className={corners[idx] ? 'text-[#f8fafc]' : 'text-[#737785]'}>
                    {label}
                  </span>
                  {corners[idx] && (
                    <span className="text-[#94a3b8] text-xs ml-auto">
                      ({corners[idx][0]}, {corners[idx][1]})
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Instructions */}
            <div className="bg-[#1e293b] rounded-xl border border-[#334155] p-4">
              <p className="text-[#94a3b8] text-sm leading-relaxed">
                请在左侧模板图上按顺序点击球场的 <span className="text-[#a78bfa] font-semibold">4个角点</span>：
                左上 → 右上 → 右下 → 左下。
                确保四个点分别落在白色球场边线的四个角上。
              </p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleReset}
                disabled={corners.length === 0 && !showAutoPreview || submitting}
                className="w-full py-3 rounded-xl bg-[#334155] hover:bg-[#475569] text-[#e2e8f0] font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                重新标注
              </button>
              <button
                onClick={handleSubmit}
                disabled={corners.length !== 4 || submitting}
                className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  corners.length === 4 && !submitting
                    ? 'bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:from-[#8b5cf6] hover:to-[#a78bfa] shadow-lg shadow-[#6366f1]/30 cursor-pointer'
                    : 'bg-[#334155] text-[#737785] cursor-not-allowed'
                }`}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {submitting ? '提交中...' : '确认并继续'}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
