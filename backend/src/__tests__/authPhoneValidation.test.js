const { schemas } = require('../middleware/inputValidation');

// The register/registerUsername schemas normalize phone to E.164 and reject
// undeliverable numbers via a custom Joi rule (utils/phone.js). These assert
// the edge behavior at the validation boundary — the actual persistence of a
// normalized value is covered by authRegisterReferral/integration tests.
describe('auth schemas — phone validation', () => {
  function validate(schema, body) {
    return schema.validate(body, { abortEarly: false, stripUnknown: true, convert: true });
  }

  describe('register schema', () => {
    const base = { email: 'a@b.com', password: 'Password1' };

    test('normalizes a valid phone to E.164', () => {
      const { error, value } = validate(schemas.auth.register, { ...base, phone: '0712 345 678' });
      expect(error).toBeUndefined();
      expect(value.phone).toBe('+254712345678');
    });

    test('rejects an undeliverable phone', () => {
      const { error } = validate(schemas.auth.register, { ...base, phone: 'not-a-phone' });
      expect(error).toBeDefined();
      expect(error.details[0].message).toMatch(/Invalid phone number/);
    });

    test('phone is optional — omitting it is valid', () => {
      const { error, value } = validate(schemas.auth.register, base);
      expect(error).toBeUndefined();
      expect(value.phone).toBeUndefined();
    });
  });

  describe('registerUsername schema', () => {
    const base = { username: 'alice', password: 'Password1' };

    test('normalizes a valid phone to E.164', () => {
      const { error, value } = validate(schemas.auth.registerUsername, { ...base, phone: '+254712345678' });
      expect(error).toBeUndefined();
      expect(value.phone).toBe('+254712345678');
    });

    test('rejects an undeliverable phone', () => {
      const { error } = validate(schemas.auth.registerUsername, { ...base, phone: '123' });
      expect(error).toBeDefined();
    });
  });
});
