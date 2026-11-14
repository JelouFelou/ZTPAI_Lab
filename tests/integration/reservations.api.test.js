const request = require('supertest');
const knex = require('knex');
const jwt = require('jsonwebtoken');
const { config } = require('../../src/config');
const dbConfig = require('../../knexfile');
const { createApp } = require('../../src/app');
const { createKnexUnitOfWork } = require('../../src/db/unitOfWork');
const { createEventBus } = require('../../src/events/eventBus');
const { registerAuditListeners } = require('../../src/events/auditListeners');
const { randomUUID } = require('node:crypto');
const databaseName = `room_booking_test05_${randomUUID().replaceAll('-', '')}`;
let adminDb, db, app, bus, unregister;
const user = id => jwt.sign({ role: id === 1 ? 'ADMIN' : 'USER' }, config.JWT_SECRET, { subject: String(id), expiresIn: '15m' });
const body = { roomId: 1, participants: 5, startTime: '2099-12-01T10:00:00Z', endTime: '2099-12-01T11:00:00Z' };
const auth = (method, path, id = 2) => request(app)[method](path).set('Authorization', `Bearer ${user(id)}`);
beforeAll(async () => {
    // CREATE DATABASE, migrations and cleanup only target a unique owned DB.
    const maintenanceUrl = new URL(config.DATABASE_URL); maintenanceUrl.pathname = '/postgres';
    adminDb = knex({ ...dbConfig, connection: maintenanceUrl.toString() });
    await adminDb.raw('CREATE DATABASE ??', [databaseName]);
    const url = new URL(config.DATABASE_URL); url.pathname = `/${databaseName}`;
    db = knex({ ...dbConfig, connection: url.toString() });
    await db.migrate.latest();
    bus = createEventBus();
    unregister = registerAuditListeners(bus, db);
    app = createApp({ ...createKnexUnitOfWork(db), config, eventBus: bus });
});
beforeEach(async () => {
    await bus.drain();
    await db.raw('TRUNCATE audit_log, reservations, rooms, buildings, users RESTART IDENTITY CASCADE');
    await db.seed.run();
});
afterAll(async () => {
    if (bus) await bus.drain();
    if (db) await db.destroy();
    if (adminDb) { await adminDb.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [databaseName]); await adminDb.destroy(); }
});
test('register, login and me', async () => {
    const account = { email: 'new@example.com', password: 'Strong-password-2026!' };
    const registered = await request(app).post('/api/auth/register').send(account).expect(201);
    expect(registered.body).not.toHaveProperty('passwordHash');
    const login = await request(app).post('/api/auth/login').send(account).expect(200);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body).toMatchObject({ email: account.email, role: 'USER' });
});
test('201, Location and SQL persistence', async () => {
    const created = await auth('post', '/api/reservations').send(body).expect(201);
    expect(created.headers.location).toBe(`/api/reservations/${created.body.id}`);
    expect(await db('reservations').where({ id: created.body.id }).first()).toMatchObject({ room_id: 1, user_id: 2, status: 'CONFIRMED' });
});
test('400 with body field details', async () => {
    const res = await auth('post', '/api/reservations').send({ ...body, participants: 0 }).expect(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: expect.arrayContaining([expect.objectContaining({ location: 'body', field: 'participants' })]) });
});
test('401 without token', async () => {
    const res = await request(app).get('/api/reservations').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
});
test('403 when USER creates a room', async () => {
    await auth('post', '/api/rooms').send({ name: 'X', buildingId: 1, capacity: 10 }).expect(403);
});
test('404 for foreign reservation', async () => {
    const res = await auth('get', '/api/reservations/1', 3).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
});
test('409 ROOM_ALREADY_BOOKED', async () => {
    await auth('post', '/api/reservations').send(body).expect(201);
    const res = await auth('post', '/api/reservations').send(body).expect(409);
    expect(res.body.error.code).toBe('ROOM_ALREADY_BOOKED');
});
test('pagination counts all matching rows', async () => {
    const res = await auth('get', '/api/reservations?limit=2', 1).expect(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 5, limit: 2, totalPages: 3 });
});
test('audit: create, collision, ADMIN cancel, repeated cancel; filter and access', async () => {
    const notification = jest.spyOn(console, 'log');
    try {
        const created = await auth('post', '/api/reservations').send(body).expect(201);
        await auth('post', '/api/reservations').send(body).expect(409);
        const path = `/api/reservations/${created.body.id}/cancel`;
        const first = await auth('patch', path, 1).expect(200);
        const second = await auth('patch', path, 1).expect(200);
        expect(second.body.cancelledAt).toBe(first.body.cancelledAt);
        await bus.drain();
        const rows = await db('audit_log').orderBy('id');
        expect(rows.map(row => row.event_type)).toEqual(['reservation.created', 'reservation.cancelled']);
        expect(rows[1].payload).toMatchObject({ userId: 2, cancelledBy: 1 });
        expect(notification).toHaveBeenCalledWith(expect.stringContaining('[notification] to: user@example.com'));
        await auth('get', '/api/admin/audit-log').expect(403);
        const audit = await auth('get', '/api/admin/audit-log?limit=1', 1).expect(200);
        expect(audit.body.data[0].event_type).toBe('reservation.cancelled');
        expect(audit.body.meta.total).toBe(2);
        const filtered = await auth('get', '/api/admin/audit-log?eventType=reservation.created', 1).expect(200);
        expect(filtered.body.meta.total).toBe(1);
    } finally { notification.mockRestore(); }
});
test('broken audit listener logs error but API still returns 201', async () => {
    unregister();
    const errors = jest.spyOn(console, 'error');
    const stop = registerAuditListeners(bus, db, { saveAudit: () => { throw new Error('DEMO: audit unavailable'); } });
    try {
        const created = await auth('post', '/api/reservations').send(body).expect(201);
        await bus.drain();
        expect(await db('reservations').where({ id: created.body.id }).first()).toBeDefined();
        expect(await db('audit_log')).toHaveLength(0);
        expect(errors).toHaveBeenCalledWith(expect.stringContaining('DEMO: audit unavailable'));
    } finally { stop(); errors.mockRestore(); unregister = registerAuditListeners(bus, db); }
});
