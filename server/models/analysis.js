const model = require('./base/model');

const schema = {
  userId: { type: String, default: '' },
  videoName: { type: String, required: true },
  videoPath: { type: String, required: true },
  mode: { type: String, required: true, enum: ['singles', 'doubles'] },
  status: { type: String, required: true, enum: ['pending', 'annotated', 'running', 'completed', 'failed', 'auto_detecting', 'auto_failed'], default: 'pending' },
  annotationMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
  autoConfidence: { type: Number, default: 0 },
  corners: { type: Array, default: [] },
  screenshotPath: { type: String, default: '' },
  screenshotWidth: { type: Number, default: 0 },
  screenshotHeight: { type: Number, default: 0 },
  resultDir: { type: String, default: '' },
  outputVideoPath: { type: String, default: '' },
  heatmapPaths: { type: Array, default: [] },
  scatterPaths: { type: Array, default: [] },
  errorMessage: { type: String, default: '' },
  create_at: { type: Date, default: Date.now },
  update_at: { type: Date, default: Date.now },
  device: { type: String, enum: ['cpu', 'mps', 'cuda'], default: 'cpu' }
};

module.exports = model(schema, 'analyses');
module.exports.index({ create_at: 1 });
module.exports.index({ userId: 1, create_at: -1 });
