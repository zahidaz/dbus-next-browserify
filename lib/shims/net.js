module.exports = {
  createConnection: function () {
    throw new Error('TCP/Unix sockets not available in browser. Use ws:// or wss:// address.');
  }
};
