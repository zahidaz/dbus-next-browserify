# Browser WebSocket Support

Browser support via `package.json` `"browser"` field module swapping. Node.js usage unaffected.

## New Files

- `lib/websocket-stream.js` — Wraps browser WebSocket with Node stream interface (`read(n)`, `write`, events)
- `lib/shims/put.js` — Replaces `@nornagon/put` using Uint8Array + DataView
- `lib/shims/fs.js` — Stub that errors, triggering auth fallback to ANONYMOUS
- `lib/shims/net.js` — Stub that throws directing users to `ws://`
- `lib/shims/noop.js` — Empty module for unreachable deps (event-stream, child_process, usocket, x11)
- `lib/shims/globals.js` — esbuild inject file providing `process`, `global`, `Buffer`
- `examples/browser/server.js` — HTTP + WebSocket mock D-Bus server for browser testing
- `examples/browser/index.html` — Browser test page (32 assertions across all D-Bus types)

## Modified Files

- `lib/connection.js` — Intercepts `ws://`/`wss://` addresses before the D-Bus address parser, returns WebSocketStream. Added `noAuth` option to skip handshake.
- `lib/service/handlers.js` — try/catch around `fs.readFileSync('/var/lib/dbus/machine-id')`
- `index.js` — Added `connect(address, opts)` entry point for direct WebSocket URLs
- `package.json` — `"browser"` field (16 mappings), polyfill deps, esbuild build scripts, `lib/shims/*` in files array
- `.gitignore` — Added `/dist`

## Browser Differences

- Use `connect('ws://...')` instead of `systemBus()`/`sessionBus()`
- `noAuth: true` option skips D-Bus auth handshake (e.g. frida-server)
- No DBUS_COOKIE_SHA1 auth, no Unix fd passing, no tcp/unix/unixexec transports
