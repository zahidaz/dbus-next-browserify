# Browser Usage

## Build

```bash
npm run build:browser        # ESM  → dist/dbus-next.js
npm run build:browser:iife   # IIFE → dist/dbus-next.iife.js
```

## CDN

```html
<script src="https://cdn.jsdelivr.net/gh/zahidaz/dbus-next-browserify@release/dist/dbus-next.iife.js"></script>
```

```js
import * as dbus from 'https://cdn.jsdelivr.net/gh/zahidaz/dbus-next-browserify@release/dist/dbus-next.js';
```

## Self-hosted

```bash
npm run build:browser        # ESM  → dist/dbus-next.js
npm run build:browser:iife   # IIFE → dist/dbus-next.iife.js
```

IIFE (exposes `DBusNext` global):
```html
<script src="dbus-next.iife.js"></script>
```

ESM:
```html
<script type="module">
  import * as dbus from './dbus-next.js';
</script>
```

## Connect

```js
const bus = dbus.connect('ws://localhost:9876');

bus.on('connect', () => {
  console.log('connected as', bus.name);
});

bus.on('error', (err) => {
  console.error(err);
});
```

## Connect without auth (e.g. frida-server)

```js
const bus = dbus.connect('ws://localhost:27042', { noAuth: true });
```

## Call a method

```js
const msg = new dbus.Message({
  path: '/org/example/Object',
  destination: 'org.example.Service',
  interface: 'org.example.Interface',
  member: 'MethodName',
  signature: 's',
  body: ['argument']
});

const reply = await bus.call(msg);
console.log(reply.body);
```

## Listen for signals

```js
bus.on('message', (msg) => {
  if (msg.type === dbus.MessageType.SIGNAL && msg.member === 'MySignal') {
    console.log('signal:', msg.body);
  }
});
```

## Subscribe to signals via AddMatch

```js
bus.call(new dbus.Message({
  path: '/org/freedesktop/DBus',
  destination: 'org.freedesktop.DBus',
  interface: 'org.freedesktop.DBus',
  member: 'AddMatch',
  signature: 's',
  body: ["type='signal',interface='org.example.Interface'"]
}));
```

## Use Variant types

```js
const { Variant } = dbus;

const msg = new dbus.Message({
  path: '/org/example/Object',
  destination: 'org.example.Service',
  interface: 'org.freedesktop.DBus.Properties',
  member: 'Set',
  signature: 'ssv',
  body: ['org.example.Interface', 'PropertyName', new Variant('s', 'value')]
});

await bus.call(msg);
```

## Disconnect

```js
bus.disconnect();
```

## Limitations

- Only `ws://` and `wss://` transports work in the browser
- `systemBus()` and `sessionBus()` are not available
- No Unix file descriptor passing
- No DBUS_COOKIE_SHA1 authentication
