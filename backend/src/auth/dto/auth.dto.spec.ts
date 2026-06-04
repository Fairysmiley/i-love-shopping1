import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LoginDto, RegisterDto } from './auth.dto';

async function errorsFor<T extends object>(cls: new () => T, payload: object): Promise<string[]> {
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto as object);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('User input validation', () => {
  describe('RegisterDto', () => {
    const valid = {
      email: 'shopper@example.com',
      password: 'Str0ng!Passw0rd',
      firstName: 'Ada',
      lastName: 'Lovelace',
    };

    it('accepts a well-formed registration', async () => {
      expect(await errorsFor(RegisterDto, valid)).toHaveLength(0);
    });

    it('rejects an invalid email', async () => {
      const errs = await errorsFor(RegisterDto, { ...valid, email: 'not-an-email' });
      expect(errs.join(' ')).toMatch(/valid email/i);
    });

    it('rejects weak passwords (too short / missing classes)', async () => {
      expect((await errorsFor(RegisterDto, { ...valid, password: 'short' })).length).toBeGreaterThan(0);
      expect((await errorsFor(RegisterDto, { ...valid, password: 'alllowercase1!' })).length).toBeGreaterThan(0);
      expect((await errorsFor(RegisterDto, { ...valid, password: 'NoSymbols123' })).length).toBeGreaterThan(0);
    });

    it('rejects empty names', async () => {
      expect((await errorsFor(RegisterDto, { ...valid, firstName: '' })).length).toBeGreaterThan(0);
    });

    it('treats injection-like payloads as plain (invalid) strings, not commands', async () => {
      // The value is rejected by the email validator; it is never interpreted.
      const errs = await errorsFor(RegisterDto, {
        ...valid,
        email: "robert'); DROP TABLE users;--",
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });

  describe('LoginDto', () => {
    it('requires email and password', async () => {
      const errs = await errorsFor(LoginDto, {});
      expect(errs.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects injection-like email strings at validation time', async () => {
      const errs = await errorsFor(LoginDto, {
        email: "admin' OR '1'='1",
        password: 'Str0ng!Passw0rd',
      });
      expect(errs.length).toBeGreaterThan(0);
    });
  });
});
