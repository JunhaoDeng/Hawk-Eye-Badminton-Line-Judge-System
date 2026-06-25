import axios from 'axios';

// ========== Health (no auth required) ==========
export const healthCheck = () =>
  axios.get('/api/v1/health').then(res => res.data);

const api = axios.create({ baseURL: '' });

// Request interceptor — attach JWT token
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  err => Promise.reject(err)
);

// Response interceptor — unwrap data; redirect to login on 401
api.interceptors.response.use(
  res => res.data,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ========== Auth ==========
export const login = (email, password) =>
  api.post('/api/v1/auth/login', { email, password });

export const register = (email, password) =>
  api.post('/api/v1/auth/register', { email, password });

// ========== Video ==========
export const uploadVideo = (formData) =>
  api.post('/api/v1/video/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const batchUpload = (formData) =>
  api.post('/api/v1/video/batch-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });

export const getScreenshot = (id) =>
  `/api/v1/video/screenshot/${id}`;

export const getTemplate = (id) =>
  `/api/v1/video/template/${id}`;

export const submitAnnotation = (id, corners) =>
  api.post(`/api/v1/video/annotate/${id}`, { corners });

export const autoDetectPreview = (id) =>
  api.get(`/api/v1/video/auto-detect-preview/${id}`);

export const autoAnnotate = (id) =>
  api.post(`/api/v1/video/auto-annotate/${id}`);

export const startAnalysis = (id) =>
  api.post(`/api/v1/video/analyze/${id}`);

export const getStatus = (id) =>
  api.get(`/api/v1/video/status/${id}`);

export const batchStatus = (ids) =>
  api.post('/api/v1/video/batch-status', { ids });

export const getResults = (id) =>
  api.get(`/api/v1/video/results/${id}`);

export const getAnalysisList = (page = 1, pageSize = 20) =>
  api.get('/api/v1/video/list', { params: { page, pageSize } });

export const deleteAnalysis = (id) =>
  api.post('/api/v1/video/delete', { id });

export const downloadResults = (id) =>
  `/api/v1/video/download/${id}`;

export default api;
