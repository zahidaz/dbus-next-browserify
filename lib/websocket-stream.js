var EventEmitter = require('events').EventEmitter;
var Buffer = require('safe-buffer').Buffer;

function WebSocketStream (ws) {
  EventEmitter.call(this);
  this._ws = ws;
  this._chunks = [];
  this._totalBytes = 0;
  this.writable = true;
  this.supportsUnixFd = false;

  var self = this;

  ws.binaryType = 'arraybuffer';

  ws.onopen = function () {
    self.emit('connect');
  };

  ws.onmessage = function (event) {
    var data = new Uint8Array(event.data);
    self._chunks.push(data);
    self._totalBytes += data.length;
    self.emit('readable');
  };

  ws.onerror = function (err) {
    self.emit('error', err);
  };

  ws.onclose = function () {
    self.writable = false;
    self.emit('end');
  };
}

WebSocketStream.prototype = Object.create(EventEmitter.prototype);
WebSocketStream.prototype.constructor = WebSocketStream;

WebSocketStream.prototype.read = function (n) {
  if (this._totalBytes < n) return null;

  var result = Buffer.alloc(n);
  var offset = 0;
  while (offset < n) {
    var chunk = this._chunks[0];
    var needed = n - offset;
    if (chunk.length <= needed) {
      result.set(chunk, offset);
      offset += chunk.length;
      this._chunks.shift();
    } else {
      result.set(chunk.subarray(0, needed), offset);
      this._chunks[0] = chunk.subarray(needed);
      offset += needed;
    }
  }
  this._totalBytes -= n;
  return result;
};

WebSocketStream.prototype.write = function (data) {
  if (typeof data === 'string') {
    this._ws.send(new TextEncoder().encode(data));
  } else if (data && data.data) {
    this._ws.send(data.data);
  } else {
    this._ws.send(data);
  }
};

WebSocketStream.prototype.end = function () {
  this._ws.close();
};

WebSocketStream.prototype.setNoDelay = function () {};

module.exports = WebSocketStream;
