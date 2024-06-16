import FqdnValidator from '../../../../src/minecraft/server/blocklist/FqdnValidator.js';

describe('valid FQDNs', () => {
  test.each([
    ['example.com'],
    ['example.com.'],
    ['foobar.example.com'],
    ['foobar.example.com.'],
    ['foo.bar'],
    ['a.b']
  ])('%s', (input) => {
    expect(new FqdnValidator().validateFqdn(input)).toBe(true);
  });
});

describe('invalid FQDNs', () => {
  test.each([
    ['example'],
    ['localhost'],
    ['127.0.0.1'],
    ['::1'],
    ['example.com:80']
  ])('%s', (input) => {
    expect(new FqdnValidator().validateFqdn(input)).toBe(false);
  });
});
