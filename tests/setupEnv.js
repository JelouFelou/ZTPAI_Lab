// Set before configuration loads .env. This URL never targets the developer DB.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://room_user:example_password@localhost:5432/room_booking_test';
process.env.JWT_SECRET = 'test-only-secret-at-least-thirty-two-characters';
