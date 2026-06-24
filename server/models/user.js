const model = require('./base/model');

const schema = {
  email: { type: String, default: '' },
  password: { type: String, default: '' },
  create_at: { type: Date, default: Date.now },
  update_at: { type: Date, default: Date.now },
};

const UserModel = model(schema, 'users');
UserModel.index({ create_at: 1 });
UserModel.index({ email: 1 }, { unique: true });

module.exports = UserModel;
