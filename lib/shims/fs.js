var err = new Error('fs not available in browser');

module.exports = {
  stat: function (path, cb) { cb(err); },
  readFile: function (path, enc, cb) { if (typeof enc === 'function') { enc(err); } else { cb(err); } },
  readFileSync: function () { throw err; }
};
