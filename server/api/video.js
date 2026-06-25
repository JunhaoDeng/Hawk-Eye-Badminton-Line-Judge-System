const multer = require('@koa/multer');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { processPool } = require('../utils/processPool');
const { getPythonPaths } = require('../utils/pythonResolver');

const projectRoot = path.resolve(__dirname, '..', '..');
const videosDir = path.join(projectRoot, 'videos');
const screenshotsDir = path.join(projectRoot, 'screenshots');

/** Cross-platform Python resolution: cached first-working path */
let _resolvedPython = null;
function resolvePython() {
  if (_resolvedPython) return _resolvedPython;
  const paths = getPythonPaths(global.config.get('pythonPath'));
  for (const pyPath of paths) {
    try {
      // Use spawnSync with array args to avoid shell quoting issues
      const result = spawnSync(pyPath, ['-c', 'print("ok")'], {
        stdio: 'ignore',
        timeout: 3000,
        cwd: projectRoot
      });
      if (result.status === 0 && result.error === undefined) {
        _resolvedPython = pyPath;
        console.log('[video] Resolved Python:', pyPath);
        return pyPath;
      }
    } catch (e) {
      // try next
    }
  }
  _resolvedPython = 'python';
  return 'python';
}

[videosDir, screenshotsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videosDir);
  },
  filename: (req, file, cb) => {
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    const uniqueName = `${base}_${Date.now()}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });
const uploadMulti = multer({ storage });

module.exports = function (router) {

  // ========== Upload single video (legacy, kept for manual mode) ==========
  router.post('/api/v1/video/upload', upload.single('file'), async (ctx) => {
    const file = ctx.file;
    if (!file) {
      ctx.body = { code: 400, success: false, msg: '请选择视频文件' };
      return;
    }

    const mode = ctx.request.body.mode || 'singles';
    const annotationMode = ctx.request.body.annotationMode || 'manual';
    const device = ctx.request.body.device || 'cpu';
    if (!['singles', 'doubles'].includes(mode)) {
      ctx.body = { code: 400, success: false, msg: 'mode 只能是 singles 或 doubles' };
      return;
    }
    if (!['cpu', 'mps', 'cuda'].includes(device)) {
      ctx.body = { code: 400, success: false, msg: 'device 只能是 cpu、mps 或 cuda' };
      return;
    }

    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const videoPath = file.path;
    const pythonPath = resolvePython();
    const screenshotName = `${path.basename(videoPath, path.extname(videoPath))}_screenshot.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotName);

    const extractScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'extract_frame.py');
    const extractArgs = [
      extractScript,
      '--video-path', videoPath,
      '--output-path', screenshotPath,
      '--timestamp', '2'
    ];

    try {
      const extractResult = await runPythonScript(pythonPath, extractArgs, 10000);
      const extractData = JSON.parse(extractResult);

      if (!extractData.success) {
        ctx.body = { code: 500, success: false, msg: '截图提取失败: ' + extractData.error };
        return;
      }

      const AnalysisModel = ctx.model('analysis');
      const videoName = path.basename(originalName, path.extname(originalName));
      const record = await AnalysisModel.createRow({
        userId: ctx.userId,
        videoName,
        videoPath,
        mode,
        annotationMode,
        device,
        status: annotationMode === 'auto' ? 'auto_detecting' : 'pending',
        screenshotPath,
        screenshotWidth: extractData.width,
        screenshotHeight: extractData.height,
      });

      // If auto mode, trigger auto-detection immediately
      if (annotationMode === 'auto') {
        triggerAutoAnnotation(record, pythonPath, projectRoot, AnalysisModel);
        ctx.body = {
          code: 200, success: true, msg: '上传成功，自动标注已启动',
          data: {
            id: record._id,
            videoName: record.videoName,
            mode: record.mode,
            annotationMode: record.annotationMode,
            device: record.device,
            status: 'auto_detecting',
            screenshotUrl: `/screenshots/${screenshotName}`,
            screenshotWidth: extractData.width,
            screenshotHeight: extractData.height
          }
        };
      } else {
        ctx.body = {
          code: 200, success: true, msg: '上传成功',
          data: {
            id: record._id,
            videoName: record.videoName,
            mode: record.mode,
            annotationMode: 'manual',
            device: record.device,
            status: 'pending',
            screenshotUrl: `/screenshots/${screenshotName}`,
            screenshotWidth: extractData.width,
            screenshotHeight: extractData.height
          }
        };
      }
    } catch (e) {
      console.error('Upload error:', e);
      ctx.body = { code: 500, success: false, msg: '上传处理失败: ' + e.message };
    }
  });

  // ========== Batch upload multiple videos ==========
  router.post('/api/v1/video/batch-upload', uploadMulti.array('files', 20), async (ctx) => {
    const files = ctx.files;
    if (!files || files.length === 0) {
      ctx.body = { code: 400, success: false, msg: '请选择视频文件' };
      return;
    }

    const mode = ctx.request.body.mode || 'singles';
    const annotationMode = ctx.request.body.annotationMode || 'manual';
    const device = ctx.request.body.device || 'cpu';
    if (!['singles', 'doubles'].includes(mode)) {
      ctx.body = { code: 400, success: false, msg: 'mode 只能是 singles 或 doubles' };
      return;
    }
    if (!['cpu', 'mps', 'cuda'].includes(device)) {
      ctx.body = { code: 400, success: false, msg: 'device 只能是 cpu、mps 或 cuda' };
      return;
    }

    const pythonPath = resolvePython();
    const AnalysisModel = ctx.model('analysis');
    const records = [];

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const videoPath = file.path;
      const screenshotName = `${path.basename(videoPath, path.extname(videoPath))}_screenshot.png`;
      const screenshotPath = path.join(screenshotsDir, screenshotName);

      const extractScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'extract_frame.py');

      try {
        const extractResult = await runPythonScript(pythonPath, [
          extractScript,
          '--video-path', videoPath,
          '--output-path', screenshotPath,
          '--timestamp', '2'
        ], 10000);
        const extractData = JSON.parse(extractResult);

        if (!extractData.success) {
          records.push({
            videoName: path.basename(originalName, path.extname(originalName)),
            status: 'failed',
            errorMessage: '截图提取失败: ' + extractData.error
          });
          continue;
        }

        const videoName = path.basename(originalName, path.extname(originalName));
        const initialStatus = annotationMode === 'auto' ? 'auto_detecting' : 'pending';

        const record = await AnalysisModel.createRow({
          userId: ctx.userId,
          videoName,
          videoPath,
          mode,
          annotationMode,
          device,
          status: initialStatus,
          screenshotPath,
          screenshotWidth: extractData.width,
          screenshotHeight: extractData.height,
        });

        records.push({
          id: record._id,
          videoName: record.videoName,
          mode: record.mode,
          annotationMode: record.annotationMode,
          status: record.status,
          screenshotUrl: `/screenshots/${screenshotName}`,
          screenshotWidth: extractData.width,
          screenshotHeight: extractData.height
        });

        // If auto mode, trigger auto-detection
        if (annotationMode === 'auto') {
          triggerAutoAnnotation(record, pythonPath, projectRoot, AnalysisModel);
        }
      } catch (e) {
        console.error('Batch upload error for file:', originalName, e);
        records.push({
          videoName: path.basename(originalName, path.extname(originalName)),
          status: 'failed',
          errorMessage: '处理失败: ' + e.message
        });
      }
    }

    ctx.body = {
      code: 200, success: true, msg: `批量上传完成，共 ${files.length} 个文件`,
      data: { records, total: files.length }
    };
  });

  // ========== Get screenshot (public - used by <img> tag, no auth header) ==========
  router.get('/api/v1/video/screenshot/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    // Public route: auth middleware is skipped, so ctx.userId is undefined.
    // Query by _id only; the ID is a random ObjectId, not guessable.
    const record = await AnalysisModel.getRow({ _id: ctx.params.id });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    if (!record.screenshotPath || !fs.existsSync(record.screenshotPath)) {
      ctx.body = { code: 404, success: false, msg: '截图文件不存在' };
      return;
    }

    ctx.set('Content-Type', 'image/png');
    ctx.body = fs.createReadStream(record.screenshotPath);
  });

  // ========== Get template image (public - used by annotate page <img> tag) ==========
  router.get('/api/v1/video/template/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    const templatePath = findTemplatePath(projectRoot, record.mode);
    if (!fs.existsSync(templatePath)) {
      ctx.body = { code: 404, success: false, msg: '模板文件不存在' };
      return;
    }

    ctx.set('Content-Type', 'image/png');
    ctx.body = fs.createReadStream(templatePath);
  });

  // ========== Submit court annotation manually (4 corner points) ==========
  router.post('/api/v1/video/annotate/:id', async (ctx) => {
    const corners = ctx.request.body?.corners;
    if (!corners || !Array.isArray(corners) || corners.length !== 4) {
      ctx.body = { code: 400, success: false, msg: '需要4个角点坐标' };
      return;
    }

    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    // Allow annotation from 'pending' or 'auto_failed' status
    if (record.status !== 'pending' && record.status !== 'auto_failed') {
      ctx.body = { code: 400, success: false, msg: '当前状态不允许标注，状态: ' + record.status };
      return;
    }

    const pythonPath = resolvePython();
    const videoName = record.videoName;

    const resultDir = path.join(projectRoot, 'results', videoName);
    fs.mkdirSync(resultDir, { recursive: true });

    // Use template image for annotation, NOT the screenshot
    const templatePath = findTemplatePath(projectRoot, record.mode);

    const computeScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'compute_annotation.py');
    const cornersJson = JSON.stringify(corners);
    const computeArgs = [
      computeScript,
      '--corners-json', cornersJson,
      '--template-path', templatePath,
      '--video-path', record.videoPath,
      '--output-dir', resultDir
    ];

    try {
      const computeResult = await runPythonScript(pythonPath, computeArgs, 10000);
      const computeData = JSON.parse(computeResult);

      if (!computeData.success) {
        ctx.body = { code: 500, success: false, msg: '标注计算失败: ' + computeData.error };
        return;
      }

      await AnalysisModel.updateRow({ _id: record._id }, {
        status: 'annotated',
        annotationMode: 'manual',
        corners: corners,
        resultDir,
        update_at: new Date()
      });

      ctx.body = {
        code: 200, success: true, msg: '标注完成',
        data: {
          roi_corners: computeData.roi_corners,
          mid_height: computeData.mid_height
        }
      };
    } catch (e) {
      console.error('Annotation error:', e);
      ctx.body = { code: 500, success: false, msg: '标注处理失败: ' + e.message };
    }
  });

  // ========== Auto-detect preview: run detection and return corners without changing status ==========
  router.get('/api/v1/video/auto-detect-preview/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    // NOTE: Auto-detection runs on the TEMPLATE image, not the video screenshot.
    // We do NOT check screenshotPath here — the screenshot may be cleaned up
    // or generated on a different machine, and the detection doesn't need it.

    const pythonPath = resolvePython();
    const resultDir = path.join(projectRoot, 'results', record.videoName);
    fs.mkdirSync(resultDir, { recursive: true });

    // Auto-detect on the TEMPLATE image, not the video screenshot.
    // NOTE: do NOT pass --video-path here — the frontend displays the template image,
    // so corners must be in template-image coordinates (not video coordinates).
    const templatePath = findTemplatePath(projectRoot, record.mode);
    const detectScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'auto_detect_corners.py');

    const detectArgs = [
      detectScript,
      '--image-path', templatePath,
      '--output-dir', resultDir
    ];

    try {
      const stdout = await runPythonScript(pythonPath, detectArgs, 15000);
      const detectData = JSON.parse(stdout);

      ctx.body = {
        code: 200,
        success: true,
        msg: 'ok',
        data: {
          success: detectData.success,
          corners: detectData.corners || null,
          confidence: detectData.confidence || 0,
          strategy: detectData.strategy || 'none',
          error: detectData.error || ''
        }
      };
    } catch (e) {
      console.error(`[AutoDetectPreview ${record._id}] Error:`, e.message);
      ctx.body = {
        code: 200,
        success: true,
        msg: 'auto detection preview failed',
        data: { success: false, corners: null, confidence: 0, strategy: 'none', error: e.message }
      };
    }
  });

  // ========== Auto-annotate: detect court corners automatically ==========
  router.post('/api/v1/video/auto-annotate/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    // Idempotent: if already annotated/running/completed, don't re-trigger
    if (record.status === 'annotated' || record.status === 'running' || record.status === 'completed') {
      ctx.body = {
        code: 200, success: true, msg: '自动标注已完成或分析已启动',
        data: { id: record._id, status: record.status }
      };
      return;
    }

    // Allow from 'pending', 'auto_failed', or 'auto_detecting' (idempotent retry)
    if (record.status !== 'pending' && record.status !== 'auto_failed' && record.status !== 'auto_detecting') {
      ctx.body = { code: 400, success: false, msg: '当前状态不允许自动标注，状态: ' + record.status };
      return;
    }

    // If already auto_detecting, don't trigger again
    if (record.status === 'auto_detecting') {
      ctx.body = {
        code: 200, success: true, msg: '自动标注已在运行中',
        data: { id: record._id, status: 'auto_detecting' }
      };
      return;
    }

    await AnalysisModel.updateRow({ _id: record._id }, {
      status: 'auto_detecting',
      annotationMode: 'auto',
      update_at: new Date()
    });

    const pythonPath = resolvePython();
    triggerAutoAnnotation(await AnalysisModel.getRow({ _id: record._id }), pythonPath, projectRoot, AnalysisModel);

    ctx.body = {
      code: 200, success: true, msg: '自动标注已启动',
      data: { id: record._id, status: 'auto_detecting' }
    };
  });

  // ========== Trigger AI analysis (uses process pool) ==========
  router.post('/api/v1/video/analyze/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    // Idempotent: if already running or completed, just return success
    if (record.status === 'running') {
      ctx.body = { code: 200, success: true, msg: '分析已在运行中', data: { id: record._id, status: 'running' } };
      return;
    }
    if (record.status === 'completed') {
      ctx.body = { code: 200, success: true, msg: '分析已完成', data: { id: record._id, status: 'completed' } };
      return;
    }

    if (record.status !== 'annotated') {
      ctx.body = { code: 400, success: false, msg: '请先完成球场标注，当前状态: ' + record.status };
      return;
    }

    // Atomically transition from 'annotated' to 'running' using the status
    // field in the filter — this prevents race conditions where two concurrent
    // POST requests both pass the getRow check and both spawn a process.
    const startedAt = new Date();
    const updateResult = await AnalysisModel.updateRow(
      { _id: record._id, status: 'annotated' },
      { status: 'running', startedAt, update_at: new Date() }
    );

    if (!updateResult || updateResult.modifiedCount === 0) {
      // Another request already transitioned the status (e.g. StrictMode
      // double-effect on Analysis.jsx sent a second POST before this one
      // finished). Return idempotent response — the first request will
      // spawn the real process.
      console.log(`[Analysis ${record._id}] Status already transitioned by another request, skipping`);
      ctx.body = { code: 200, success: true, msg: '分析已在运行中', data: { id: record._id, status: 'running' } };
      return;
    }

    const pythonPath = resolvePython();
    // Find template image path based on game mode
    const originalTemplatePath = findTemplatePath(projectRoot, record.mode);

    // Resize template to match video dimensions
    const resizedTemplatePath = path.join(record.resultDir, 'court_template.png');
    try {
      const resizeScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'resize_template.py');
      const resizeResult = await runPythonScript(pythonPath, [
        resizeScript,
        '--template-path', originalTemplatePath,
        '--video-path', record.videoPath,
        '--output-path', resizedTemplatePath
      ], 15000);
      const resizeData = JSON.parse(resizeResult);
      if (!resizeData.success) {
        console.log(`[Analysis ${record._id}] Template resize warning:`, resizeData.error || 'unknown');
      }
    } catch (e) {
      console.error(`[Analysis ${record._id}] Template resize error, using original:`, e.message);
    }

    const templatePath = fs.existsSync(resizedTemplatePath) ? resizedTemplatePath : originalTemplatePath;

    const mainScript = path.join(projectRoot, 'main.py');
    const args = [
      mainScript,
      '--video-path', record.videoPath,
      '--mode', record.mode,
      '--template-path', templatePath,
      '--display', 'false',
      '--output-dir', record.resultDir,
      '--device', record.device || 'cpu',
    ];

    // Configure process pool (0 means no limit)
    const maxConcurrent = global.config.has('maxConcurrent') ? global.config.get('maxConcurrent') : 2;
    processPool.maxConcurrent = maxConcurrent || Infinity;
    processPool.configure(pythonPath, projectRoot);

    const spawnResult = processPool.spawnAnalysis(record._id, {
      args,
      pythonPath,
      projectRoot,
      onComplete: async (code, stderrOutput) => {
        const processingTime = Math.round((Date.now() - startedAt.getTime()) / 1000);
        if (code === 0) {
          const resultDir = record.resultDir;
          const videoFileBase = path.basename(record.videoPath, path.extname(record.videoPath));
          const outputVideo = path.join(resultDir, `detect_${videoFileBase}.mp4`);
          const heatmapDir = path.join(resultDir, 'position_visualizations', 'heatmaps');
          const scatterDir = path.join(resultDir, 'position_visualizations', 'scatter_plots');

          const heatmaps = listImages(heatmapDir, resultDir);
          const scatterPlots = listImages(scatterDir, resultDir);

          await AnalysisModel.updateRow({ _id: record._id }, {
            status: 'completed',
            outputVideoPath: outputVideo,
            heatmapPaths: heatmaps,
            scatterPaths: scatterPlots,
            processingTime,
            update_at: new Date()
          });
        } else {
          await AnalysisModel.updateRow({ _id: record._id }, {
            status: 'failed',
            errorMessage: stderrOutput.slice(-500),
            processingTime,
            update_at: new Date()
          });
        }
      },
      onError: async (err) => {
        console.error(`[Analysis ${record._id}] process error:`, err);
        await AnalysisModel.updateRow({ _id: record._id }, {
          status: 'failed',
          errorMessage: err.message,
          update_at: new Date()
        });
      }
    });

    if (spawnResult === 'duplicate') {
      console.log(`[Analysis ${record._id}] Analysis already running via process pool, skipping duplicate`);
    }

    ctx.body = {
      code: 200, success: true, msg: '分析已启动',
      data: { id: record._id, status: 'running' }
    };
  });

  // ========== Get analysis status ==========
  router.get('/api/v1/video/status/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    ctx.body = {
      code: 200, success: true, msg: 'ok',
      data: {
        id: record._id,
        status: record.status,
        errorMessage: record.errorMessage || '',
        videoName: record.videoName,
        mode: record.mode,
        annotationMode: record.annotationMode || 'manual',
        autoConfidence: record.autoConfidence || 0
      }
    };
  });

  // ========== Batch status query ==========
  router.post('/api/v1/video/batch-status', async (ctx) => {
    const ids = ctx.request.body?.ids;
    if (!ids || !Array.isArray(ids)) {
      ctx.body = { code: 400, success: false, msg: '需要ids数组' };
      return;
    }

    const AnalysisModel = ctx.model('analysis');
    const records = await AnalysisModel.getRows({ _id: { $in: ids }, userId: ctx.userId });

    ctx.body = {
      code: 200, success: true, msg: 'ok',
      data: {
        records: records.map(r => ({
          id: r._id,
          videoName: r.videoName,
          mode: r.mode,
          status: r.status,
          annotationMode: r.annotationMode || 'manual',
          autoConfidence: r.autoConfidence || 0,
          errorMessage: r.errorMessage || ''
        }))
      }
    };
  });

  // ========== Get analysis results ==========
  router.get('/api/v1/video/results/:id', async (ctx) => {
    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    if (record.status !== 'completed') {
      ctx.body = { code: 400, success: false, msg: '分析尚未完成，状态: ' + record.status };
      return;
    }

    const resultDir = record.resultDir;
    const videoFileBase = path.basename(record.videoPath, path.extname(record.videoPath));
    const videoUrl = `/results/${record.videoName}/detect_${videoFileBase}.mp4`;

    const heatmapDir = path.join(resultDir, 'position_visualizations', 'heatmaps');
    const scatterDir = path.join(resultDir, 'position_visualizations', 'scatter_plots');
    const heatmaps = listImages(heatmapDir, resultDir);
    const scatterPlots = listImages(scatterDir, resultDir);

    ctx.body = {
      code: 200, success: true, msg: 'ok',
      data: {
        id: record._id,
        videoName: record.videoName,
        mode: record.mode,
        annotationMode: record.annotationMode || 'manual',
        status: record.status,
        videoUrl,
        heatmaps,
        scatterPlots,
        create_at: record.create_at
      }
    };
  });

  // ========== List all analyses ==========
  router.get('/api/v1/video/list', async (ctx) => {
    const page = parseInt(ctx.query.page) || 1;
    const pageSize = parseInt(ctx.query.pageSize) || 20;
    const skip = (page - 1) * pageSize;

    const AnalysisModel = ctx.model('analysis');
    const total = await AnalysisModel.getRowsCount({ userId: ctx.userId });
    const list = await AnalysisModel.getPagedRows({ userId: ctx.userId }, skip, pageSize, { create_at: -1 });

    ctx.body = {
      code: 200, success: true, msg: 'ok',
      data: { list: list || [], total, page, pageSize }
    };
  });

  // ========== Download selected result files as ZIP (public - no auth header) ==========
  router.get('/api/v1/video/download/:id', async (ctx) => {
    let archiver;
    try {
      archiver = require('archiver');
    } catch (e) {
      console.error('archiver module not available:', e.message);
      ctx.body = { code: 500, success: false, msg: '服务器缺少 archiver 模块，请联系管理员' };
      return;
    }

    try {
      const AnalysisModel = ctx.model('analysis');
      const record = await AnalysisModel.getRow({ _id: ctx.params.id });
      if (!record) {
        ctx.body = { code: 404, success: false, msg: '记录不存在' };
        return;
      }

      if (record.status !== 'completed') {
        ctx.body = { code: 400, success: false, msg: '分析尚未完成，无法下载' };
        return;
      }

      const resultDir = record.resultDir;
      if (!fs.existsSync(resultDir)) {
        ctx.body = { code: 404, success: false, msg: '结果目录不存在' };
        return;
      }

      const videoFileBase = path.basename(record.videoPath, path.extname(record.videoPath));
      const videoPath = path.join(resultDir, `detect_${videoFileBase}.mp4`);
      const heatmapDir = path.join(resultDir, 'position_visualizations', 'heatmaps');
      const scatterDir = path.join(resultDir, 'position_visualizations', 'scatter_plots');

      const zipName = `detect_${videoFileBase}.zip`;

      // Collect archive into a Buffer for reliable delivery
      const archive = archiver('zip', { zlib: { level: 9 } });
      const chunks = [];
      const warnings = [];

      await new Promise((resolve, reject) => {
        archive.on('data', chunk => chunks.push(chunk));
        archive.on('end', resolve);
        archive.on('error', reject);
        // Capture warnings to diagnose silent file-skip issues
        archive.on('warning', err => warnings.push(err.message || String(err)));

        // Use a helper that reads file content explicitly to avoid archiver
        // silent-skip bugs (especially on Windows with non-ASCII paths)
        const addFileSafely = (filePath, zipName) => {
          try {
            if (!filePath || typeof filePath !== 'string') {
              console.warn('[Download] Skipping file - path is not a string:', filePath); return;
            }
            if (!fs.existsSync(filePath)) {
              console.warn('[Download] Skipping file - not found:', filePath); return;
            }
            const content = fs.readFileSync(filePath);
            archive.append(content, { name: zipName });
          } catch (e) {
            console.error('[Download] Failed to add file to zip:', filePath, e.message);
          }
        };

        // Add analyzed video file
        addFileSafely(videoPath, '分析视频/' + path.basename(videoPath));

        // Add original video file
        addFileSafely(record.videoPath, '原始视频/' + path.basename(record.videoPath));

        // Add heatmap images
        if (fs.existsSync(heatmapDir)) {
          fs.readdirSync(heatmapDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
            .forEach(f => addFileSafely(path.join(heatmapDir, f), '热力图/' + f));
        }

        // Add scatter plot images
        if (fs.existsSync(scatterDir)) {
          fs.readdirSync(scatterDir)
            .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
            .forEach(f => addFileSafely(path.join(scatterDir, f), '散点图/' + f));
        }

        archive.finalize();
      });

      if (warnings.length > 0) {
        console.warn('[Download] archiver warnings:', warnings);
      }

      const zipBuffer = Buffer.concat(chunks);
      ctx.set('Content-Type', 'application/zip');
      ctx.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);
      ctx.set('Content-Length', zipBuffer.length.toString());
      ctx.body = zipBuffer;
    } catch (e) {
      console.error('Download ZIP error:', e);
      if (!ctx.res.headersSent) {
        ctx.status = 500;
        ctx.body = { code: 500, success: false, msg: '打包下载失败: ' + e.message };
      }
    }
  });

  // ========== Delete an analysis ==========
  router.post('/api/v1/video/delete', async (ctx) => {
    const id = ctx.request.body?.id;
    if (!id) {
      ctx.body = { code: 400, success: false, msg: '缺少记录ID' };
      return;
    }

    const AnalysisModel = ctx.model('analysis');
    const record = await AnalysisModel.getRow({ _id: id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '记录不存在' };
      return;
    }

    // Kill any running process
    processPool.kill(id);

    try { if (fs.existsSync(record.videoPath)) fs.unlinkSync(record.videoPath); } catch (e) { }
    try { if (fs.existsSync(record.screenshotPath)) fs.unlinkSync(record.screenshotPath); } catch (e) { }
    try { if (record.resultDir && fs.existsSync(record.resultDir)) fs.rmSync(record.resultDir, { recursive: true }); } catch (e) { }

    await AnalysisModel.deleteRow({ _id: id });

    ctx.body = { code: 200, success: true, msg: '删除成功' };
  });
};


// ========== Helper functions ==========

function runPythonScript(pythonPath, args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, args, {
      cwd: projectRoot,
      env: { ...process.env, PYTHONPATH: projectRoot },
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
        // Some scripts (like extract_frame.py) print error JSON to stdout, not stderr
        const detail = stderr.trim() || stdout.trim() || '(no output)';
        reject(new Error('Python script failed: ' + detail.slice(-300)));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Trigger auto annotation for a record.
 * Runs auto_detect_corners.py, then on success triggers analysis via process pool.
 * On failure (or low confidence), marks as auto_failed.
 */
function triggerAutoAnnotation(record, pythonPath, projectRoot, AnalysisModel) {
  const resultDir = path.join(projectRoot, 'results', record.videoName);
  fs.mkdirSync(resultDir, { recursive: true });

  // Auto-detect on the TEMPLATE image, not the video screenshot
  const templatePath = findTemplatePath(projectRoot, record.mode);
  const detectScript = path.join(projectRoot, 'badminton_analysis', 'utils', 'auto_detect_corners.py');

  const detectArgs = [
    detectScript,
    '--image-path', templatePath,
    '--video-path', record.videoPath,
    '--output-dir', resultDir
  ];

  runPythonScript(pythonPath, detectArgs, 15000)
    .then(async (stdout) => {
      const detectData = JSON.parse(stdout);

      if (!detectData.success) {
        console.error(`[AutoAnnotate ${record._id}] Detection failed:`, detectData.error);
        await AnalysisModel.updateRow({ _id: record._id }, {
          status: 'auto_failed',
          errorMessage: '自动标注失败: ' + detectData.error,
          update_at: new Date()
        });
        return;
      }

      // Low confidence → still save but mark as auto_failed so user can review
      if (detectData.confidence < 0.5) {
        console.log(`[AutoAnnotate ${record._id}] Low confidence: ${detectData.confidence}`);
        await AnalysisModel.updateRow({ _id: record._id }, {
          status: 'auto_failed',
          annotationMode: 'auto',
          corners: detectData.corners,
          autoConfidence: detectData.confidence,
          resultDir,
          errorMessage: `自动标注置信度较低(${detectData.confidence})，建议手动标注`,
          update_at: new Date()
        });
        return;
      }

      // Success: save corners and trigger analysis
      console.log(`[AutoAnnotate ${record._id}] Success, confidence: ${detectData.confidence}`);
      await AnalysisModel.updateRow({ _id: record._id }, {
        status: 'annotated',
        annotationMode: 'auto',
        corners: detectData.corners,
        autoConfidence: detectData.confidence,
        resultDir,
        update_at: new Date()
      });

      // Automatically trigger analysis
      const updatedRecord = await AnalysisModel.getRow({ _id: record._id });
      triggerAnalysis(updatedRecord, pythonPath, projectRoot, AnalysisModel);
    })
    .catch(async (e) => {
      console.error(`[AutoAnnotate ${record._id}] Error:`, e.message);
      await AnalysisModel.updateRow({ _id: record._id }, {
        status: 'auto_failed',
        errorMessage: '自动标注异常: ' + e.message,
        update_at: new Date()
      });
    });
}

/**
 * Trigger analysis for a record via the process pool.
 */
async function triggerAnalysis(record, pythonPath, projectRoot, AnalysisModel) {
  // Atomically transition from 'annotated' to 'running' to prevent race
  // conditions with concurrent frontend API calls (e.g. Analysis.jsx
  // StrictMode double-effect)
  const startedAt = new Date();
  const updateResult = await AnalysisModel.updateRow(
    { _id: record._id, status: 'annotated' },
    { status: 'running', startedAt, update_at: new Date() }
  );

  if (!updateResult || updateResult.modifiedCount === 0) {
    console.log(`[Analysis ${record._id}] Status already transitioned by another path, skipping triggerAnalysis`);
    return;
  }

  const originalTemplatePath = findTemplatePath(projectRoot, record.mode);
  const resizedTemplatePath = path.join(record.resultDir, 'court_template.png');

  // Resize template before spawning analysis
  try {
    const resizeResult = await runPythonScript(pythonPath, [
      path.join(projectRoot, 'badminton_analysis', 'utils', 'resize_template.py'),
      '--template-path', originalTemplatePath,
      '--video-path', record.videoPath,
      '--output-path', resizedTemplatePath
    ], 15000);
    const resizeData = JSON.parse(resizeResult);
    if (!resizeData.success) {
      console.log(`[Analysis ${record._id}] Template resize warning:`, resizeData.error);
    }
  } catch (e) {
    console.error(`[Analysis ${record._id}] Template resize error:`, e.message);
  }

  const templatePath = fs.existsSync(resizedTemplatePath) ? resizedTemplatePath : originalTemplatePath;

  const mainScript = path.join(projectRoot, 'main.py');
  const args = [
    mainScript,
    '--video-path', record.videoPath,
    '--mode', record.mode,
    '--template-path', templatePath,
    '--display', 'false',
    '--output-dir', record.resultDir,
    '--device', record.device || 'cpu',
  ];

  // 0 means no limit — let the system run as many as it can
  const maxConcurrent = global.config.has('maxConcurrent') ? global.config.get('maxConcurrent') : 2;
  processPool.maxConcurrent = maxConcurrent || Infinity;
  processPool.configure(pythonPath, projectRoot);

  const spawnResult = processPool.spawnAnalysis(record._id, {
    args,
    pythonPath,
    projectRoot,
    onComplete: async (code, stderrOutput) => {
      const processingTime = Math.round((Date.now() - startedAt.getTime()) / 1000);
      if (code === 0) {
        const resultDir = record.resultDir;
        const videoFileBase = path.basename(record.videoPath, path.extname(record.videoPath));
        const outputVideo = path.join(resultDir, `detect_${videoFileBase}.mp4`);
        const heatmapDir = path.join(resultDir, 'position_visualizations', 'heatmaps');
        const scatterDir = path.join(resultDir, 'position_visualizations', 'scatter_plots');

        const heatmaps = listImages(heatmapDir, resultDir);
        const scatterPlots = listImages(scatterDir, resultDir);

        await AnalysisModel.updateRow({ _id: record._id }, {
          status: 'completed',
          outputVideoPath: outputVideo,
          heatmapPaths: heatmaps,
          scatterPaths: scatterPlots,
          processingTime,
          update_at: new Date()
        });
      } else {
        await AnalysisModel.updateRow({ _id: record._id }, {
          status: 'failed',
          errorMessage: stderrOutput.slice(-500),
          processingTime,
          update_at: new Date()
        });
      }
    },
    onError: async (err) => {
      console.error(`[Analysis ${record._id}] process error:`, err);
      await AnalysisModel.updateRow({ _id: record._id }, {
        status: 'failed',
        errorMessage: err.message,
        update_at: new Date()
      });
    }
  });

  if (spawnResult === 'duplicate') {
    console.log(`[Analysis ${record._id}] Analysis already running via another path, skipping duplicate`);
  }
}

function findTemplatePath(projectRoot, mode) {
  const templatesDir = path.join(projectRoot, 'templates');
  if (!fs.existsSync(templatesDir)) {
    throw new Error('templates 目录不存在');
  }
  // Pick template based on game mode
  const templateName = mode === 'doubles' ? 'double.png' : 'demo.png';
  const templatePath = path.join(templatesDir, templateName);
  if (fs.existsSync(templatePath)) {
    return templatePath;
  }
  // Fallback: first PNG
  const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  if (files.length === 0) {
    throw new Error('templates 目录下没有模板图片');
  }
  return path.join(templatesDir, files[0]);
}

function listImages(dir, baseDir) {
  if (!fs.existsSync(dir)) return [];
  const videoName = path.basename(baseDir);
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.png') || f.endsWith('.jpg'))
    .map(f => {
      const relative = path.relative(baseDir, path.join(dir, f));
      return `/results/${videoName}/${relative.replace(/\\/g, '/')}`;
    });
}
