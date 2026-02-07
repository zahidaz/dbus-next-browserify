# Frida Server

frida-server (v15.0+) speaks D-Bus wire protocol over WebSocket on port 27042. It skips the D-Bus auth handshake, so use `noAuth: true`.

## Connect

```js
const dbus = require('dbus-next'); // or import from browser bundle

const bus = dbus.connect('ws://device-ip:27042', { noAuth: true });

bus.on('connect', () => {
  console.log('connected to frida-server');
});
```

## List running processes

```js
const msg = new dbus.Message({
  path: '/re/frida/HostSession',
  destination: 're.frida.HostSession',
  interface: 're.frida.HostSession',
  member: 'EnumerateProcesses',
  signature: 'a{sv}',
  body: [{}]
});

const reply = await bus.call(msg);
console.log(reply.body);
```

## Attach to a process

```js
const msg = new dbus.Message({
  path: '/re/frida/HostSession',
  destination: 're.frida.HostSession',
  interface: 're.frida.HostSession',
  member: 'Attach',
  signature: 'ua{sv}',
  body: [pid, {}]
});

const reply = await bus.call(msg);
const sessionId = reply.body[0];
```

## Browser usage

```html
<script src="dbus-next.iife.js"></script>
<script>
  var bus = DBusNext.connect('ws://device-ip:27042', { noAuth: true });

  bus.on('connect', function() {
    var msg = new DBusNext.Message({
      path: '/re/frida/HostSession',
      destination: 're.frida.HostSession',
      interface: 're.frida.HostSession',
      member: 'EnumerateProcesses',
      signature: 'a{sv}',
      body: [{}]
    });

    bus.call(msg).then(function(reply) {
      console.log(reply.body);
    });
  });
</script>
```
