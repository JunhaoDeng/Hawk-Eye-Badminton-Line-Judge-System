module.exports = function (router) {
  router.get('/api/v1/health', async (ctx) => {
    ctx.body = { code: 200, success: true, msg: 'ok', data: { status: 'running' } };
  });
};
