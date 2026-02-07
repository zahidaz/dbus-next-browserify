const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Buffer = require('safe-buffer').Buffer;
const constants = require('../../lib/constants');
const DBusBuffer = require('../../lib/dbus-buffer');
const headerSignature = require('../../lib/header-signature.json');
const { Variant } = require('../../lib/variant');
const { messageToJsFmt, marshallMessage } = require('../../lib/marshall-compat');

const PORT = 9876;
const NOAUTH_PORT = 9877;
let clientCounter = 0;

const MIME = { '.html': 'text/html', '.js': 'application/javascript' };
const ROOT = path.resolve(__dirname, '../..');

const httpServer = http.createServer((req, res) => {
  let filePath;
  if (req.url === '/' || req.url === '/index.html') {
    filePath = path.join(__dirname, 'index.html');
  } else if (req.url === '/dbus-next.iife.js') {
    filePath = path.join(ROOT, 'dist', 'dbus-next.iife.js');
  } else {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end(err.message);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

function parseMessage (buf) {
  const endian = buf[0];
  const isLE = endian === constants.endianness.le;
  const bodyLen = isLE ? buf.readUInt32LE(4) : buf.readUInt32BE(4);
  const serial = isLE ? buf.readUInt32LE(8) : buf.readUInt32BE(8);
  const fieldsLen = isLE ? buf.readUInt32LE(12) : buf.readUInt32BE(12);

  const fieldsBuf = buf.slice(16);
  const dbuf = new DBusBuffer(fieldsBuf, 0, endian);
  const fields = dbuf.readArray(headerSignature[0].child[0], fieldsLen);

  const msg = { type: buf[1], flags: buf[2], serial: serial };
  for (const f of fields) {
    const name = constants.headerTypeName[f[0]];
    msg[name] = f[1][1][0];
  }

  if (bodyLen > 0 && msg.signature) {
    dbuf.align(3);
    msg.body = dbuf.read(msg.signature);
    messageToJsFmt(msg);
  }

  return msg;
}

function buildReply (replySerial, destination, sender, signature, body) {
  const msg = {
    type: 2,
    flags: 1,
    serial: 1000 + replySerial,
    replySerial: replySerial,
    destination: destination,
    sender: sender
  };
  if (signature) {
    msg.signature = signature;
    msg.body = body;
  }
  return marshallMessage(msg);
}

function buildError (replySerial, destination, sender, errorName, errorMsg) {
  const msg = {
    type: 3,
    flags: 1,
    serial: 2000 + replySerial,
    replySerial: replySerial,
    destination: destination,
    sender: sender,
    errorName: errorName,
    signature: 's',
    body: [errorMsg]
  };
  return marshallMessage(msg);
}

function buildSignal (serial, path, iface, member, destination, signature, body) {
  const msg = {
    type: 4,
    flags: 1,
    serial: serial,
    path: path,
    interface: iface,
    member: member,
    sender: 'org.test.Server'
  };
  if (destination) msg.destination = destination;
  if (signature) {
    msg.signature = signature;
    msg.body = body;
  }
  return marshallMessage(msg);
}

const server = new WebSocketServer({ server: httpServer });

httpServer.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] open http://localhost:${PORT} in your browser`);
  console.log('[server] waiting for connections...\n');
});

httpServer.on('error', (err) => {
  console.error('[server] error:', err.message);
});

server.on('headers', (headers, req) => {
  console.log(`[server] incoming upgrade request from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
});

server.on('connection', (ws, req) => {
  const uniqueName = `:1.${++clientCounter}`;
  let pending = Buffer.alloc(0);
  let handshakeComplete = false;
  let signalSerial = 5000;

  console.log(`[${uniqueName}] websocket connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  ws.on('message', (data) => {
    const buf = Buffer.from(data);

    if (handshakeComplete) {
      try {
        handleBinary(buf);
      } catch (e) {
        console.error(`[${uniqueName}] error handling binary message:`, e.message);
      }
      return;
    }

    pending = Buffer.concat([pending, buf]);

    while (true) {
      const nlIdx = pending.indexOf(0x0a);
      if (nlIdx === -1) break;

      const lineBytes = pending.slice(0, nlIdx);
      pending = pending.slice(nlIdx + 1);
      const line = lineBytes.toString('ascii').replace(/\r$/, '').replace(/^\0*/, '');

      if (!line) continue;

      console.log(`[${uniqueName}] auth: ${line}`);

      if (line === 'BEGIN') {
        handshakeComplete = true;
        console.log(`[${uniqueName}] handshake complete`);
        if (pending.length > 0) {
          try {
            handleBinary(pending);
          } catch (e) {
            console.error(`[${uniqueName}] error handling leftover binary:`, e.message);
          }
          pending = Buffer.alloc(0);
        }
        break;
      }

      if (line.startsWith('AUTH ANONYMOUS')) {
        ws.send(Buffer.from('OK 1234deadbeef5678\r\n'));
      } else if (line.startsWith('AUTH ')) {
        ws.send(Buffer.from('REJECTED ANONYMOUS\r\n'));
      }
    }
  });

  function handleBinary (buf) {
    const msg = parseMessage(buf);
    console.log(`[${uniqueName}] << ${msg.interface || ''}.${msg.member} (serial=${msg.serial}, sig=${msg.signature || '(none)'})`);

    if (msg.member === 'Hello') {
      const [reply] = buildReply(msg.serial, uniqueName, 'org.freedesktop.DBus', 's', [uniqueName]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> Hello: ${uniqueName}`);

    } else if (msg.member === 'AddMatch') {
      const [reply] = buildReply(msg.serial, uniqueName, 'org.freedesktop.DBus');
      ws.send(reply);

    } else if (msg.member === 'EchoString') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 's', [msg.body[0]]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> EchoString: "${msg.body[0]}"`);

    } else if (msg.member === 'EchoMultiple') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, msg.signature, msg.body);
      ws.send(reply);
      console.log(`[${uniqueName}] >> EchoMultiple: ${JSON.stringify(msg.body)}`);

    } else if (msg.member === 'GetBasicTypes') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'ybnqiuds', [
        255,
        true,
        -1234,
        65000,
        -100000,
        100000,
        3.14159265,
        'hello from server'
      ]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetBasicTypes`);

    } else if (msg.member === 'GetArray') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'ai', [[10, 20, 30, 40, 50]]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetArray`);

    } else if (msg.member === 'GetDict') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'a{su}', [{ alpha: 1, beta: 2, gamma: 3 }]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetDict`);

    } else if (msg.member === 'GetStruct') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, '(siu)', [['structval', -42, 999]]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetStruct`);

    } else if (msg.member === 'GetNested') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'a{sai}', [{
        primes: [2, 3, 5, 7, 11],
        evens: [2, 4, 6, 8, 10]
      }]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetNested`);

    } else if (msg.member === 'GetVariant') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'v', [new Variant('s', 'variant-value')]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetVariant`);

    } else if (msg.member === 'GetVariantDict') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'a{sv}', [{
        name: new Variant('s', 'dbus-next'),
        version: new Variant('u', 1),
        features: new Variant('as', ['websocket', 'browser', 'marshall'])
      }]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetVariantDict`);

    } else if (msg.member === 'SendAndVerify') {
      const ok = msg.body.length === 4 &&
                 typeof msg.body[0] === 'string' &&
                 typeof msg.body[1] === 'number' &&
                 Array.isArray(msg.body[2]) &&
                 typeof msg.body[3] === 'boolean';
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 'sb', [
        ok ? 'all types received correctly' : 'type mismatch',
        ok
      ]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> SendAndVerify: ${ok ? 'PASS' : 'FAIL'} ${JSON.stringify(msg.body)}`);

    } else if (msg.member === 'TriggerError') {
      const [reply] = buildError(msg.serial, uniqueName, msg.destination, 'org.test.Error.TestError', 'This is a test error from the server');
      ws.send(reply);
      console.log(`[${uniqueName}] >> TriggerError`);

    } else if (msg.member === 'GetServerTime') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 's', [new Date().toISOString()]);
      ws.send(reply);
      console.log(`[${uniqueName}] >> GetServerTime`);

    } else if (msg.member === 'SubscribeSignals') {
      const [reply] = buildReply(msg.serial, uniqueName, msg.destination);
      ws.send(reply);

      let count = 0;
      const interval = setInterval(() => {
        if (ws.readyState !== ws.OPEN || count >= 5) {
          clearInterval(interval);
          const [done] = buildSignal(signalSerial++, '/org/test/Server', 'org.test.Server', 'SignalsDone', uniqueName, 'u', [count]);
          if (ws.readyState === ws.OPEN) ws.send(done);
          return;
        }
        count++;
        const [sig] = buildSignal(signalSerial++, '/org/test/Server', 'org.test.Server', 'Counter', uniqueName, 'us', [count, 'signal ' + count + ' of 5']);
        ws.send(sig);
      }, 500);

      ws.on('close', () => clearInterval(interval));
      console.log(`[${uniqueName}] >> SubscribeSignals: sending 5 signals`);

    } else {
      console.log(`[${uniqueName}] >> unhandled: ${msg.member}`);
    }
  }

  ws.on('close', (code) => {
    console.log(`[${uniqueName}] disconnected (code=${code})`);
  });

  ws.on('error', (err) => {
    console.error(`[${uniqueName}] ws error:`, err.message);
  });
});

const noAuthServer = new WebSocketServer({ port: NOAUTH_PORT });

noAuthServer.on('listening', () => {
  console.log(`[noauth] listening on ws://localhost:${NOAUTH_PORT} (no auth handshake)`);
});

noAuthServer.on('error', (err) => {
  console.error('[noauth] error:', err.message);
});

noAuthServer.on('connection', (ws) => {
  const uniqueName = `:2.${++clientCounter}`;
  let signalSerial = 5000;

  console.log(`[noauth][${uniqueName}] connected`);

  ws.on('message', (data) => {
    const buf = Buffer.from(data);
    try {
      handleNoAuthBinary(ws, buf, uniqueName, signalSerial, () => signalSerial++);
    } catch (e) {
      console.error(`[noauth][${uniqueName}] error:`, e.message);
    }
  });

  ws.on('close', (code) => {
    console.log(`[noauth][${uniqueName}] disconnected (code=${code})`);
  });

  ws.on('error', (err) => {
    console.error(`[noauth][${uniqueName}] ws error:`, err.message);
  });
});

function handleNoAuthBinary (ws, buf, uniqueName, signalSerial, nextSerial) {
  const msg = parseMessage(buf);
  console.log(`[noauth][${uniqueName}] << ${msg.interface || ''}.${msg.member} (serial=${msg.serial})`);

  if (msg.member === 'Hello') {
    const [reply] = buildReply(msg.serial, uniqueName, 'org.freedesktop.DBus', 's', [uniqueName]);
    ws.send(reply);
    console.log(`[noauth][${uniqueName}] >> Hello: ${uniqueName}`);
  } else if (msg.member === 'AddMatch') {
    const [reply] = buildReply(msg.serial, uniqueName, 'org.freedesktop.DBus');
    ws.send(reply);
  } else if (msg.member === 'EchoString') {
    const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 's', [msg.body[0]]);
    ws.send(reply);
    console.log(`[noauth][${uniqueName}] >> EchoString: "${msg.body[0]}"`);
  } else if (msg.member === 'GetServerTime') {
    const [reply] = buildReply(msg.serial, uniqueName, msg.destination, 's', [new Date().toISOString()]);
    ws.send(reply);
    console.log(`[noauth][${uniqueName}] >> GetServerTime`);
  } else {
    console.log(`[noauth][${uniqueName}] >> unhandled: ${msg.member}`);
  }
}
