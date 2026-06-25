let glob = require("glob");
let util = require('util');
let path = require('path');
let mongoose = require('mongoose');

let middleware = module.exports = options => {
  mongoose = options.mongoose ? options.mongoose : mongoose;

  middleware.models = {};
  if (options.schemas) {
    mongoose.Promise = global.Promise;
    middleware.db = mongoose.connect(options.host);

    let schemas = path.normalize(options.schemas);
    // Ensure trailing separator for glob
    if (!schemas.endsWith(path.sep)) {
      schemas += path.sep;
    }
    // Use forward-slash pattern for glob (cross-platform safe)
    let globPattern = schemas.replace(/\\/g, '/') + '**/*.js';
    let files = glob.sync(globPattern);
    files.map(file => {
      // Skip base/model.js — it's a factory, not a schema
      // Use path.normalize to handle both forward and backslash separators on Windows
      if (path.normalize(file).includes(path.join('base', 'model.js'))) return;
      // glob on Windows may return relative backslash paths (e.g. "models\\user.js").
      // Node.js require() needs either an absolute path or "./" prefixed relative path.
      // Use path.resolve() to convert to an absolute path that works on all platforms.
      let absolutePath = path.resolve(file);
      let modelName = path.basename(file, '.js').toLowerCase();
      let schemaDef = require(absolutePath);
      middleware.models[modelName] = mongoose.model(modelName, schemaDef);
    });
  }

  return async function (ctx, next) {
    ctx.model = model => {
      try {
        return middleware.model(middleware.db, model);
      } catch (err) {
        ctx.throw(400, err.message);
      }
    };
    ctx.mongoose = mongoose;
    ctx.document = (model, document) => new (ctx.model(model))(document);
    await next();
  };
};

middleware.model = (database, model) => {
  let name = model.toLowerCase();
  if (!middleware.models.hasOwnProperty(name)) {
    throw new Error(util.format('Model not found: %s.%s', database, model));
  }
  return mongoose.model(model, middleware.models[name].schema);
};

middleware.document = (database, model, document) => new (middleware.model(database, model))(document);
middleware.mongoose = mongoose;
