// Jest setup file
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_testing';
process.env.SESSION_SECRET = 'test_session_secret_for_testing';
process.env.ADMIN_API_KEY = 'test_admin_key_for_testing';
process.env.FIELD_ENCRYPTION_KEY = '1111111111111111111111111111111111111111111111111111111111111111'.slice(0, 64);
process.env.FIELD_BLIND_INDEX_KEY = '2222222222222222222222222222222222222222222222222222222222222222'.slice(0, 64);
