const fs = require('node:fs');
const assert = require('node:assert/strict');
const { config } = require('../src/config');
const evidence = { date: new Date().toISOString(), requests: [] };
const base = 'http://localhost:3000';
async function call(method, path, body, token, expected = 200) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    if (!path.includes('/auth/')) {
        const item = { method, path, status: response.status, body: data };
        evidence.requests.push(item);
        console.log(`${method} ${path} -> HTTP ${response.status}`);
    }
    return data;
}
async function main() {
    const suffix = Date.now();
    const admin = (await call('POST', '/api/auth/login', { email: 'admin@example.com', password: 'Admin-demo-2026!' })).accessToken;
    const account = { email: `report05-${suffix}@example.com`, password: 'Report-demo-2026!' };
    await call('POST', '/api/auth/register', account, undefined, 201);
    const owner = (await call('POST', '/api/auth/login', account)).accessToken;
    const building = await call('POST', '/api/buildings', { name: `Report05-${suffix}`, address: 'Testowa 5, Krakow' }, admin, 201);
    const room = await call('POST', '/api/rooms', { buildingId: building.id, name: 'Sala 05', capacity: 10 }, admin, 201);
    const input = { roomId: room.id, participants: 5, startTime: '2099-12-10T10:00:00Z', endTime: '2099-12-10T11:00:00Z' };
    const created = await call('POST', '/api/reservations', input, owner, 201);
    await call('POST', '/api/reservations', input, owner, 409);
    const path = `/api/reservations/${created.id}/cancel`;
    const first = await call('PATCH', path, undefined, admin);
    const second = await call('PATCH', path, undefined, admin);
    assert.equal(first.cancelledAt, second.cancelledAt);
    let audit;
    for (let i = 0; i < 30; i++) {
        audit = await call('GET', '/api/admin/audit-log?limit=100', undefined, admin);
        if (audit.data.filter(row => row.payload.reservationId === created.id).length === 2) break;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    const rows = audit.data.filter(row => row.payload.reservationId === created.id);
    assert.deepEqual(rows.map(row => row.event_type), ['reservation.cancelled', 'reservation.created']);
    console.log('AUDIT LOG: exactly 2 events for the scenario; conflict and repeat emitted none.');
    console.log(JSON.stringify(rows, null, 2));
    evidence.reservationId = created.id;
    evidence.audit = audit;
    fs.mkdirSync('reports/generated/zad5', { recursive: true });
    fs.writeFileSync('reports/generated/zad5/demo.json', JSON.stringify(evidence, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
