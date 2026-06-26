const model = require('./base/model');

const schema = {
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  apiUrl: { type: String, required: true },
  apiKey: { type: String, required: true },
  modelId: { type: String, required: true },
  isDefault: { type: Boolean, default: false },
  create_at: { type: Date, default: Date.now },
  update_at: { type: Date, default: Date.now },
};

const ModelConfigModel = model(schema, 'modelConfigs');
ModelConfigModel.index({ create_at: -1 });
ModelConfigModel.index({ userId: 1, isDefault: -1 });

module.exports = ModelConfigModel;
