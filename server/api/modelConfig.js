const path = require('path');

module.exports = function (router) {
  const projectRoot = path.resolve(__dirname, '..', '..');

  // ========== Get model configs for current user ==========
  router.get('/api/v1/models', async (ctx) => {
    const ModelConfigModel = ctx.model('modelConfig');
    const list = await ModelConfigModel.getRows(
      { userId: ctx.userId },
      { create_at: -1 }
    );

    ctx.body = {
      code: 200,
      success: true,
      msg: 'ok',
      data: {
        list: (list || []).map(cfg => ({
          _id: cfg._id,
          name: cfg.name,
          apiUrl: cfg.apiUrl,
          modelId: cfg.modelId,
          isDefault: cfg.isDefault,
          apiKeyMasked: maskApiKey(cfg.apiKey),
          create_at: cfg.create_at,
        }))
      }
    };
  });

  // ========== Save a new model config ==========
  router.post('/api/v1/models', async (ctx) => {
    const { name, apiUrl, apiKey, modelId } = ctx.request.body || {};

    if (!name || !apiUrl || !apiKey || !modelId) {
      ctx.body = { code: 400, success: false, msg: '模型名称、API地址、API Key 和模型ID 不能为空' };
      return;
    }

    const ModelConfigModel = ctx.model('modelConfig');

    const record = await ModelConfigModel.createRow({
      userId: ctx.userId,
      name: name.trim(),
      apiUrl: apiUrl.trim().replace(/\/+$/, ''),
      apiKey: apiKey.trim(),
      modelId: modelId.trim(),
      isDefault: false,
    });

    ctx.body = {
      code: 200,
      success: true,
      msg: '保存成功',
      data: {
        id: record._id,
        name: record.name,
        apiUrl: record.apiUrl,
        modelId: record.modelId,
        isDefault: record.isDefault,
        apiKeyMasked: maskApiKey(record.apiKey),
      }
    };
  });

  // ========== Delete a model config ==========
  router.delete('/api/v1/models/:id', async (ctx) => {
    const ModelConfigModel = ctx.model('modelConfig');
    const record = await ModelConfigModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '配置不存在' };
      return;
    }

    await ModelConfigModel.deleteRow({ _id: ctx.params.id, userId: ctx.userId });
    ctx.body = { code: 200, success: true, msg: '删除成功' };
  });

  // ========== Set a model as the active (default) model ==========
  router.put('/api/v1/models/:id/set-default', async (ctx) => {
    const ModelConfigModel = ctx.model('modelConfig');
    const record = await ModelConfigModel.getRow({ _id: ctx.params.id, userId: ctx.userId });
    if (!record) {
      ctx.body = { code: 404, success: false, msg: '配置不存在' };
      return;
    }

    if (record.isDefault) {
      ctx.body = { code: 200, success: true, msg: '已是当前使用的模型', data: { id: record._id } };
      return;
    }

    // Unset all other defaults for this user, then set this one
    await ModelConfigModel.updateRows(
      { userId: ctx.userId, isDefault: true },
      { isDefault: false, update_at: new Date() }
    );
    await ModelConfigModel.updateRow(
      { _id: record._id },
      { isDefault: true, update_at: new Date() }
    );

    ctx.body = { code: 200, success: true, msg: `已切换为使用「${record.name}」` };
  });
};


function maskApiKey(key) {
  if (!key || key.length <= 8) return '***';
  return key.slice(0, 8) + '***';
}
