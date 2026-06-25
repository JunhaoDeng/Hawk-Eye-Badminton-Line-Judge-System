const path = require('path');
const { spawn } = require('child_process');

module.exports = function (router) {
  router.get('/api/v1/health', async (ctx) => {
    const pythonPath = global.config.get('pythonPath') || 'python';
    const projectRoot = global.config.has('projectRoot')
      ? path.resolve(global.config.get('projectRoot'))
      : path.resolve(__dirname, '..', '..');
    const scriptPath = path.join(projectRoot, 'badminton_analysis', 'utils', 'gpu_detect.py');

    let gpuInfo = { cuda_available: false, cuda_device_name: '', mps_available: false, recommended_device: 'cpu', onnx_cuda: false };

    try {
      const result = await runPythonScript(pythonPath, [scriptPath], 5000);
      gpuInfo = JSON.parse(result);
    } catch (e) {
      // GPU 检测失败时使用默认值，不影响服务启动
      console.warn('[Health] GPU detection failed:', e.message);
    }

    ctx.body = { code: 200, success: true, msg: 'ok', data: { status: 'running', gpu: gpuInfo } };
  });
};

function runPythonScript(pythonPath, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      cwd: path.resolve(__dirname, '..', '..'),
      env: { ...process.env, PYTHONPATH: path.resolve(__dirname, '..', '..') },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Python script timeout'));
    }, timeout);

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error('Python script failed: ' + stderr.slice(-200)));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
