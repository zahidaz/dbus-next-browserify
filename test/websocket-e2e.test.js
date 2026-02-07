const { WebSocketServer, WebSocket } = require('ws');
const Buffer = require('safe-buffer').Buffer;
const constants = require('../lib/constants');
const DBusBuffer = require('../lib/dbus-buffer');
const headerSignature = require('../lib/header-signature.json');
const { messageToJsFmt, marshallMessage } = require('../lib/marshall-compat');

global.WebSocket = WebSocket;

const dbus = require('../index');

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

describe('WebSocket end-to-end', () => {
  let server;
  let port;
  const UNIQUE_NAME = ':1.42';

  beforeAll((done) => {
    server = new WebSocketServer({ port: 0 }, () => {
      port = server.address().port;
      done();
    });

    server.on('connection', (ws) => {
      let pending = Buffer.alloc(0);
      let handshakeComplete = false;

      ws.on('message', (data) => {
        const buf = Buffer.from(data);

        if (handshakeComplete) {
          handleBinary(ws, buf);
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

          if (line === 'BEGIN') {
            handshakeComplete = true;
            if (pending.length > 0) {
              handleBinary(ws, pending);
              pending = Buffer.alloc(0);
            }
            break;
          }

          if (line.startsWith('AUTH ANONYMOUS')) {
            ws.send(Buffer.from('OK 1234deadbeef\r\n'));
          } else if (line.startsWith('AUTH ')) {
            ws.send(Buffer.from('REJECTED ANONYMOUS\r\n'));
          }
        }
      });
    });
  });

  function handleBinary (ws, buf) {
    const msg = parseMessage(buf);

    if (msg.member === 'Hello') {
      const [reply] = buildReply(msg.serial, UNIQUE_NAME, 'org.freedesktop.DBus', 's', [UNIQUE_NAME]);
      ws.send(reply);
    } else if (msg.member === 'AddMatch') {
      const [reply] = buildReply(msg.serial, UNIQUE_NAME, 'org.freedesktop.DBus');
      ws.send(reply);
    } else if (msg.member === 'Echo') {
      const [reply] = buildReply(msg.serial, UNIQUE_NAME, msg.destination, msg.signature, msg.body);
      ws.send(reply);
    }
  }

  afterAll((done) => {
    server.close(done);
  });

  test('connect and receive unique name via Hello', (done) => {
    const bus = dbus.connect(`ws://127.0.0.1:${port}`);

    bus.on('connect', () => {
      expect(bus.name).toBe(UNIQUE_NAME);
      bus.disconnect();
      done();
    });

    bus.on('error', (err) => {
      bus.disconnect();
      done(err);
    });
  });

  test('call method and receive reply', (done) => {
    const bus = dbus.connect(`ws://127.0.0.1:${port}`);

    bus.on('connect', () => {
      const msg = new dbus.Message({
        path: '/test',
        destination: 'org.test.Service',
        interface: 'org.test.Iface',
        member: 'Echo',
        signature: 's',
        body: ['hello from websocket']
      });

      bus.call(msg).then((reply) => {
        expect(reply.body[0]).toBe('hello from websocket');
        bus.disconnect();
        done();
      }).catch((err) => {
        bus.disconnect();
        done(err);
      });
    });

    bus.on('error', (err) => {
      bus.disconnect();
      done(err);
    });
  });
});

describe('WebSocket noAuth', () => {
  let server;
  let port;
  const UNIQUE_NAME = ':1.99';

  beforeAll((done) => {
    server = new WebSocketServer({ port: 0 }, () => {
      port = server.address().port;
      done();
    });

    server.on('connection', (ws) => {
      ws.on('message', (data) => {
        const buf = Buffer.from(data);
        const msg = parseMessage(buf);

        if (msg.member === 'Hello') {
          const [reply] = buildReply(msg.serial, UNIQUE_NAME, 'org.freedesktop.DBus', 's', [UNIQUE_NAME]);
          ws.send(reply);
        } else if (msg.member === 'AddMatch') {
          const [reply] = buildReply(msg.serial, UNIQUE_NAME, 'org.freedesktop.DBus');
          ws.send(reply);
        } else if (msg.member === 'Echo') {
          const [reply] = buildReply(msg.serial, UNIQUE_NAME, msg.destination, msg.signature, msg.body);
          ws.send(reply);
        }
      });
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('connect with noAuth skips handshake', (done) => {
    const bus = dbus.connect(`ws://127.0.0.1:${port}`, { noAuth: true });

    bus.on('connect', () => {
      expect(bus.name).toBe(UNIQUE_NAME);
      bus.disconnect();
      done();
    });

    bus.on('error', (err) => {
      bus.disconnect();
      done(err);
    });
  });

  test('call method with noAuth', (done) => {
    const bus = dbus.connect(`ws://127.0.0.1:${port}`, { noAuth: true });

    bus.on('connect', () => {
      const msg = new dbus.Message({
        path: '/test',
        destination: 'org.test.Service',
        interface: 'org.test.Iface',
        member: 'Echo',
        signature: 's',
        body: ['noauth echo']
      });

      bus.call(msg).then((reply) => {
        expect(reply.body[0]).toBe('noauth echo');
        bus.disconnect();
        done();
      }).catch((err) => {
        bus.disconnect();
        done(err);
      });
    });

    bus.on('error', (err) => {
      bus.disconnect();
      done(err);
    });
  });
});
