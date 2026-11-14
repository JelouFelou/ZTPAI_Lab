const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
async function main() {
    const evidence = JSON.parse(fs.readFileSync('reports/generated/zad5/demo.json', 'utf8'));
    const id = Number(evidence.reservationId);
    if (!Number.isSafeInteger(id)) throw new Error('Invalid evidence id');
    const sql = `SELECT id, event_type, payload FROM audit_log WHERE (payload->>'reservationId')::integer = ${id} ORDER BY id;`;
    console.log(sql);
    const result = spawnSync('docker', ['compose', '--project-directory', '.review-clone', 'exec', '-T', 'db', 'psql', '-U', 'room_user', '-d', 'room_booking', '-c', sql], { encoding: 'utf8' });
    process.stdout.write(result.stdout || '');
    if (result.status !== 0) throw new Error(result.stderr);
    const login = await fetch('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.com', password: 'Admin-demo-2026!' }) });
    const { accessToken } = await login.json();
    const path = '/api/admin/audit-log?eventType=reservation.cancelled&limit=1';
    const response = await fetch('http://localhost:3000' + path, { headers: { Authorization: `Bearer ${accessToken}` } });
    console.log(`GET ${path} -> HTTP ${response.status}`);
    console.log(JSON.stringify(await response.json(), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
