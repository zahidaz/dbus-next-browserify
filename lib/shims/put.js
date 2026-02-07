var Buffer = require('safe-buffer').Buffer;

function PutStream () {
  this._buf = new Uint8Array(256);
  this._view = new DataView(this._buf.buffer);
  this._pos = 0;
  this._offset = 0;
}

PutStream.prototype._grow = function (needed) {
  if (this._pos + needed <= this._buf.length) return;
  var newSize = this._buf.length;
  while (newSize < this._pos + needed) newSize *= 2;
  var newBuf = new Uint8Array(newSize);
  newBuf.set(this._buf);
  this._buf = newBuf;
  this._view = new DataView(this._buf.buffer);
};

PutStream.prototype.word8 = function (val) {
  this._grow(1);
  this._buf[this._pos++] = val & 0xff;
  return this;
};

PutStream.prototype.word16le = function (val) {
  this._grow(2);
  this._view.setUint16(this._pos, val, true);
  this._pos += 2;
  return this;
};

PutStream.prototype.word32le = function (val) {
  this._grow(4);
  this._view.setUint32(this._pos, val >>> 0, true);
  this._pos += 4;
  return this;
};

PutStream.prototype.put = function (buf) {
  this._grow(buf.length);
  this._buf.set(buf, this._pos);
  this._pos += buf.length;
  return this;
};

PutStream.prototype.buffer = function () {
  return Buffer.from(this._buf.slice(0, this._pos));
};

module.exports = function put () {
  return new PutStream();
};
