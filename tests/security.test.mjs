import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPasswordPolicy, hashPassword, verifyPassword, parseCookies, sha256 } from '../server/security.mjs';

test('password policy rejects weak and short passwords', () => {
  assert.throws(() => assertPasswordPolicy('123456'), /12 and 128/);
  assert.throws(() => assertPasswordPolicy('onlylowercase123'), /uppercase/);
  assert.throws(() => assertPasswordPolicy('ONLYUPPERCASE123'), /lowercase/);
});

test('password hashes are salted and verify only the original password', async () => {
  const first = await hashPassword('ExampleStrongPass123');
  const second = await hashPassword('ExampleStrongPass123');
  assert.notEqual(first, second);
  assert.equal(await verifyPassword('ExampleStrongPass123', first), true);
  assert.equal(await verifyPassword('WrongPassword123', first), false);
});

test('cookie parsing preserves values containing equals and hashes tokens deterministically', () => {
  assert.deepEqual(parseCookies('xb_session=abc%3Ddef; xb_csrf=token'), { xb_session: 'abc=def', xb_csrf: 'token' });
  assert.equal(sha256('x'), sha256('x'));
});
