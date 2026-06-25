const Koa = require('koa');
const app = new Koa();
const config = require('config');
const cors = require('@koa/cors');
const serve = require('koa-static');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

global.config = config;

const JWT_SECRET = process.env.JWT_SECRET || 'badminton_analysis_jwt_secret_key';

const Router = require('koa-router');
const router = new Router();
const bodyParser = require('koa-bodyparser');

// Public route prefixes that don't require authentication
// (exact paths or prefixes — e.g. screenshot images used in <img> tags)
const PUBLIC_PATHS = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/health',
];
const PUBLIC_PREFIXES = [
  '/api/v1/video/screenshot/',
  '/api/v1/video/template/',
  '/api/v1/video/download/',
  '/results/',
  '/screenshots/',
];

function isPublicPath(path) {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some(p => path.startsWith(p));
}

// Resolve project root — server may be run from its own directory or from project root
const projectRoot = path.resolve(__dirname, config.has('projectRoot') ? config.get('projectRoot') : '..');
const publicDir = path.join(projectRoot, 'results');
const videosDir = path.join(projectRoot, 'videos');
const screenshotsDir = path.join(projectRoot, 'screenshots');

[publicDir, videosDir, screenshotsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const mount = require('koa-mount');

app.use(cors({ origin: '*', credentials: true }));
// Mount results directory under /results path so URLs like /results/double/detect_double.mp4 work
app.use(mount('/results', serve(publicDir)));
app.use(mount('/screenshots', serve(screenshotsDir)));
app.use(bodyParser());

app.use(async (ctx, next) => {
  ctx.params = { ...ctx.request.body, ...ctx.query };
  await next();
});

// JWT authentication middleware
app.use(async (ctx, next) => {
  if (isPublicPath(ctx.path)) {
    await next();
    return;
  }

  const authHeader = ctx.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.body = { code: 401, success: false, msg: '请先登录' };
    return;
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    ctx.userId = decoded.userId;
    ctx.userEmail = decoded.email;
  } catch (e) {
    ctx.status = 401;
    ctx.body = { code: 401, success: false, msg: '登录已过期，请重新登录' };
    return;
  }

  await next();
});

let mongodb_conf = config.get('mongodb');
app.use(require('./plugins/mongoose')({ ...mongodb_conf, schemas: path.join(__dirname, 'models') }));

app.use(async (ctx, next) => {
  ctx.projectRoot = projectRoot;
  ctx.videosDir = videosDir;
  ctx.screenshotsDir = screenshotsDir;
  await next();
});

function loadActions(dir) {
  let files = fs.readdirSync(dir);
  for (let file of files) {
    let p = path.join(dir, file);
    let stat = fs.lstatSync(p);
    if (stat.isDirectory()) {
      loadActions(p);
    } else if (path.extname(p) === '.js') {
      require(p)(router);
    }
  }
}

loadActions(path.join(__dirname, 'api'));

app.use(router.routes()).use(router.allowedMethods());

const port = Number(config.get('port')) + Number(process.env.NODE_APP_INSTANCE || 0);
app.listen(port, () => {
  console.log('Badminton Analysis Server running at http://localhost:' + port);
});
