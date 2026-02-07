const marshall = require('../lib/marshall');
const { unmarshall } = require('../lib/message');
const { marshall: marshallMessage } = require('../lib/message');

describe('marshall round-trip', () => {
  test('basic types round-trip through message marshall/unmarshall', () => {
    const msg = {
      serial: 1,
      type: 1,
      flags: 0,
      path: '/test/path',
      interface: 'org.test.Iface',
      member: 'TestMethod',
      destination: 'org.test.Dest',
      signature: 'ybnqiudsog',
      body: [
        255,
        true,
        -12345,
        54321,
        -100000,
        100000,
        3.14159,
        'hello world',
        '/object/path',
        'si'
      ]
    };

    const [buf] = marshallMessage(msg);
    const result = unmarshall(buf);

    expect(result.type).toBe(1);
    expect(result.serial).toBe(1);
    expect(result.path).toBe('/test/path');
    expect(result.interface).toBe('org.test.Iface');
    expect(result.member).toBe('TestMethod');
    expect(result.destination).toBe('org.test.Dest');
    expect(result.body[0]).toBe(255);
    expect(result.body[1]).toBe(true);
    expect(result.body[2]).toBe(-12345);
    expect(result.body[3]).toBe(54321);
    expect(result.body[4]).toBe(-100000);
    expect(result.body[5]).toBe(100000);
    expect(result.body[6]).toBeCloseTo(3.14159);
    expect(result.body[7]).toBe('hello world');
    expect(result.body[8]).toBe('/object/path');
    expect(result.body[9]).toBe('si');
  });

  test('array and dict round-trip', () => {
    const msg = {
      serial: 2,
      type: 1,
      flags: 0,
      path: '/test',
      member: 'Test',
      interface: 'org.test.Iface',
      signature: 'aias',
      body: [
        [1, 2, 3, 4, 5],
        ['foo', 'bar', 'baz']
      ]
    };

    const [buf] = marshallMessage(msg);
    const result = unmarshall(buf);

    expect(result.body[0]).toEqual([1, 2, 3, 4, 5]);
    expect(result.body[1]).toEqual(['foo', 'bar', 'baz']);
  });

  test('struct round-trip', () => {
    const msg = {
      serial: 3,
      type: 1,
      flags: 0,
      path: '/test',
      member: 'Test',
      interface: 'org.test.Iface',
      signature: '(si)',
      body: [
        ['hello', 42]
      ]
    };

    const [buf] = marshallMessage(msg);
    const result = unmarshall(buf);

    expect(result.body[0]).toEqual(['hello', 42]);
  });

  test('variant round-trip', () => {
    const Variant = require('../lib/variant').Variant;
    const { marshallMessage } = require('../lib/marshall-compat');
    const { messageToJsFmt } = require('../lib/marshall-compat');

    const msg = {
      serial: 4,
      type: 1,
      flags: 0,
      path: '/test',
      member: 'Test',
      interface: 'org.test.Iface',
      signature: 'v',
      body: [new Variant('s', 'variant-value')]
    };

    const [buf] = marshallMessage(msg);
    const raw = unmarshall(buf);
    const result = messageToJsFmt(raw);

    expect(result.body[0]).toBeInstanceOf(Variant);
    expect(result.body[0].signature).toBe('s');
    expect(result.body[0].value).toBe('variant-value');
  });

  test('dict round-trip through compat layer', () => {
    const { marshallMessage, messageToJsFmt } = require('../lib/marshall-compat');

    const msg = {
      serial: 5,
      type: 1,
      flags: 0,
      path: '/test',
      member: 'Test',
      interface: 'org.test.Iface',
      signature: 'a{su}',
      body: [
        { key1: 1, key2: 2, key3: 3 }
      ]
    };

    const [buf] = marshallMessage(msg);
    const raw = unmarshall(buf);
    const result = messageToJsFmt(raw);

    expect(result.body[0]).toEqual({ key1: 1, key2: 2, key3: 3 });
  });
});
