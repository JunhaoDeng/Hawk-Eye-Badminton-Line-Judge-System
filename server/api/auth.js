const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'badminton_analysis_jwt_secret_key';
const JWT_EXPIRES_IN = '30d';

module.exports = function (router) {

  // ========== Register ==========
  router.post('/api/v1/auth/register', async (ctx) => {
    const { email, password } = ctx.params;
    if (!email || !password) {
      ctx.body = { code: 400, success: false, msg: '邮箱和密码不能为空' };
      return;
    }
    if (password.length < 6) {
      ctx.body = { code: 400, success: false, msg: '密码至少6位' };
      return;
    }

    const User = ctx.model('user');
    const existing = await User.getRow({ email });
    if (existing) {
      ctx.body = { code: 400, success: false, msg: '该邮箱已注册' };
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.createRow({ email, password: hashed });
    if (!user) {
      ctx.body = { code: 500, success: false, msg: '注册失败' };
      return;
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    ctx.body = {
      code: 200, success: true, msg: '注册成功',
      data: { token, userId: user._id, email: user.email }
    };
  });

  // ========== Login ==========
  router.post('/api/v1/auth/login', async (ctx) => {
    const { email, password } = ctx.params;
    if (!email || !password) {
      ctx.body = { code: 400, success: false, msg: '邮箱和密码不能为空' };
      return;
    }

    const User = ctx.model('user');
    const user = await User.getRow({ email });
    if (!user) {
      ctx.body = { code: 400, success: false, msg: '用户不存在' };
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      ctx.body = { code: 400, success: false, msg: '密码错误' };
      return;
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    ctx.body = {
      code: 200, success: true, msg: '登录成功',
      data: { token, userId: user._id, email: user.email }
    };
  });

};
