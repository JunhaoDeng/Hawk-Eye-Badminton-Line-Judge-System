import { useState, useEffect } from 'react';
import { getModels, saveModelConfig, deleteModelConfig, setDefaultModel } from '../api.js';
import { X, Plus, Trash2, Brain, Eye, EyeOff, Loader2, AlertCircle, Check, Star } from 'lucide-react';

export default function ModelManagementModal({ open, onClose }) {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [form, setForm] = useState({ name: '', apiUrl: '', apiKey: '', modelId: '' });
  const [switchingId, setSwitchingId] = useState(null);

  useEffect(() => {
    if (open) {
      fetchConfigs();
      setForm({ name: '', apiUrl: '', apiKey: '', modelId: '' });
      setError('');
      setShowApiKey(false);
    }
  }, [open]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await getModels();
      if (res.success) {
        setConfigs(res.data?.list || []);
      }
    } catch (e) {
      console.error('Failed to load models:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.apiUrl || !form.apiKey || !form.modelId) {
      setError('请填写所有必填字段');
      return;
    }

    // Validate API URL format
    let apiUrl = form.apiUrl.trim().replace(/\/+$/, '');
    if (!apiUrl.startsWith('http://') && !apiUrl.startsWith('https://')) {
      apiUrl = 'https://' + apiUrl;
    }

    setSaving(true);
    setError('');

    try {
      const res = await saveModelConfig({
        ...form,
        apiUrl,
        apiKey: form.apiKey.trim(),
      });

      if (res.success) {
        setForm({ name: '', apiUrl: '', apiKey: '', modelId: '' });
        setShowApiKey(false);
        fetchConfigs();
      } else {
        setError(res.msg || '保存失败');
      }
    } catch (e) {
      setError('保存失败: ' + (e.response?.data?.msg || e.message));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('确定删除该模型配置？')) return;

    try {
      const res = await deleteModelConfig(id);
      if (res.success) {
        fetchConfigs();
      } else {
        setError(res.msg || '删除失败');
      }
    } catch (e) {
      setError('删除失败');
    }
  };

  const handleSetDefault = async (id) => {
    setSwitchingId(id);
    setError('');
    try {
      const res = await setDefaultModel(id);
      if (res.success) {
        fetchConfigs();
      } else {
        setError(res.msg || '切换失败');
      }
    } catch (e) {
      setError('切换失败: ' + (e.response?.data?.msg || e.message));
    } finally {
      setSwitchingId(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#1e293b] rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-hidden border border-[#334155]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#334155]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8b5cf6] to-[#a78bfa] flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-bold text-white">AI 模型管理</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#94a3b8] hover:text-white hover:bg-[#334155] rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(90vh-140px)]">
          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 bg-[#ef4444]/10 border border-[#ef4444]/30 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-[#ef4444] shrink-0 mt-0.5" />
              <p className="text-[#ef4444] text-sm">{error}</p>
              <button
                onClick={() => setError('')}
                className="ml-auto text-[#94a3b8] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Config list */}
          {configs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-widest mb-3">
                已配置模型 ({configs.length})
              </p>
              <div className="space-y-2">
                {configs.map((cfg) => (
                  <div
                    key={cfg._id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all group ${
                      cfg.isDefault
                        ? 'bg-[#8b5cf6]/8 border-[#8b5cf6]/40 ring-1 ring-[#8b5cf6]/20'
                        : 'bg-[#0f172a] border-[#1e293b] hover:border-[#334155]'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      cfg.isDefault ? 'bg-[#8b5cf6]/25' : 'bg-[#8b5cf6]/15'
                    }`}>
                      {cfg.isDefault ? (
                        <Star className="w-4 h-4 text-[#fbbf24]" />
                      ) : (
                        <Brain className="w-4 h-4 text-[#a78bfa]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm text-[#f8fafc] truncate">{cfg.name}</p>
                        {cfg.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#22c55e]/20 text-[#4ade80] font-medium shrink-0">
                            当前使用
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748b] truncate">{cfg.apiUrl}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#8b5cf6]/15 text-[#a78bfa] font-mono">
                        {cfg.modelId.slice(0, 12)}...
                      </span>
                      {!cfg.isDefault && (
                        <button
                          onClick={() => handleSetDefault(cfg._id)}
                          disabled={switchingId === cfg._id}
                          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[#8b5cf6]/15 text-[#a78bfa] hover:bg-[#8b5cf6]/25 hover:text-[#c4b5fd] transition-all disabled:opacity-50 cursor-pointer whitespace-nowrap"
                          title="切换为该模型"
                        >
                          {switchingId === cfg._id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            '使用'
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(cfg._id)}
                        className="p-1.5 text-[#64748b] hover:text-[#ef4444] hover:bg-[#ef4444]/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="删除配置"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Add new config form */}
          <div className="border-t border-[#334155] pt-5">
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-widest mb-4">
              新增模型配置
            </p>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  模型名称 <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="如：GPT-4o 视觉模型"
                  className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  API 地址 <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  type="text"
                  value={form.apiUrl}
                  onChange={(e) => setForm((p) => ({ ...p, apiUrl: e.target.value }))}
                  placeholder="如：http://192.168.20.69/v1 或 https://api.openai.com/v1"
                  className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  API Key <span className="text-[#ef4444]">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={form.apiKey}
                    onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                    placeholder="sk-..."
                    className="w-full px-4 py-2.5 pr-10 bg-[#0f172a] border border-[#334155] rounded-xl text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#a78bfa] transition-colors cursor-pointer"
                  >
                    {showApiKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#94a3b8] mb-1.5">
                  模型 ID <span className="text-[#ef4444]">*</span>
                </label>
                <input
                  type="text"
                  value={form.modelId}
                  onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
                  placeholder="如：gpt-4o、gpt-4-vision-preview 或自定义模型 ID"
                  className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-xl text-sm text-white placeholder-[#475569] focus:outline-none focus:border-[#8b5cf6] focus:ring-1 focus:ring-[#8b5cf6]/30 transition-all font-mono"
                />
              </div>
            </div>

            {/* Save button */}
            <div className="pt-2 flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-[#8b5cf6]/25 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    保存中...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    保存配置
                  </>
                )}
              </button>
            </div>

            <p className="text-[#64748b] text-xs pt-1">
              配置将用于 AI 视觉模型的球场角点自动检测功能。API Key 加密存储在服务端。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
