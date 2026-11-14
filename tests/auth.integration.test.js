const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const knex = require("knex");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const dbConfig = require("../knexfile");
const { config, childEnvironment } = require("../src/config");
const { createApp } = require("../src/app");
const { createKnexUnitOfWork } = require("../src/db/unitOfWork");
const { createReservationsService } = require("../src/modules/reservations/reservations.service");

test("Zestaw 04: auth, uprawnienia, migracja i konfiguracja", async t => {
    const databaseName = `room_booking_auth_test_${Date.now()}`;
    const admin = knex(dbConfig);
    const url = new URL(dbConfig.connection);
    url.pathname = `/${databaseName}`;
    let db;
    const servers = [];
    const evidence = { date: new Date().toISOString(), requests: [], matrix: [], token: null, configuration: [], checks: [] };
    async function listen(overrides = {}) {
        const server = http.createServer(createApp({ ...createKnexUnitOfWork(db), config: { ...config, ...overrides } }));
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        servers.push(server);
        return `http://127.0.0.1:${server.address().port}`;
    }
    try {
        await admin.raw("CREATE DATABASE ??", [databaseName]);
        db = knex({ ...dbConfig, connection: url.toString() });
        await t.test("migracja na istniejących danych i poprawny rollback", async () => {
            await db.migrate.up({ name: "001_initial.js" });
            await db.migrate.up({ name: "002_reservations_no_overlap.js" });
            await db("buildings").insert({ id: 1, name: "Old building", address: "Old address" });
            await db("rooms").insert({ id: 1, building_id: 1, name: "Old room", capacity: 20 });
            const [old] = await db("reservations").insert({ room_id: 1, reserved_by: "Stary właściciel", participants: 5,
                start_time: "2099-01-01T10:00:00Z", end_time: "2099-01-01T11:00:00Z" }).returning("*");
            await db.migrate.latest();
            const migrated = await db("reservations").where({ id: old.id }).first();
            assert.equal(migrated.room_id, old.room_id);
            assert.equal(migrated.start_time.toISOString(), old.start_time.toISOString());
            assert.equal(migrated.reserved_by, undefined);
            const legacy = await db("users").where({ id: migrated.user_id }).first();
            assert.equal(legacy.role, "USER");
            assert.equal(legacy.email, "legacy-reservations@migration.invalid");
            assert.ok(legacy.password_hash.startsWith("$2"));
            evidence.migration = { before: old, after: migrated, account: { id: legacy.id, email: legacy.email, role: legacy.role } };
            await db.migrate.down({ name: "004_reservations_user.js" });
            assert.equal((await db("reservations").where({ id: old.id }).first()).reserved_by, legacy.email);
            await db.migrate.up({ name: "004_reservations_user.js" });
            evidence.checks.push("Migracja 004 zachowuje rezerwacje na bazie z danymi; down i ponowne up działają.");
        });
        await db.seed.run();
        const base = await listen();
        async function request(path, { method = "GET", body, token, authorization, expected = 200, label, target = base } = {}) {
            const headers = { "Content-Type": "application/json" };
            if (token) headers.Authorization = `Bearer ${token}`;
            if (authorization !== undefined) headers.Authorization = authorization;
            const response = await fetch(target + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
            const raw = await response.text();
            const json = raw ? JSON.parse(raw) : null;
            evidence.requests.push({ label, method, path, status: response.status,
                requestBody: body, response: json?.accessToken ? { ...json, accessToken: "[JWT omitted; decoded payload shown separately]" } : json });
            assert.equal(response.status, expected, `${method} ${path}: ${raw}`);
            assert.ok(!raw.includes("password_hash") && !raw.includes("passwordHash"));
            if (response.status >= 400) {
                assert.ok(json.error.code && json.error.message && json.error.requestId);
                assert.equal(response.headers.get("x-request-id"), json.error.requestId);
            }
            return json;
        }
        const login = (email, password) => request("/api/auth/login", { method: "POST", body: { email, password } });
        let ownerToken, otherToken, adminToken;
        await t.test("rejestracja: hash, normalizacja, walidacja i race condition", async () => {
            const created = await request("/api/auth/register", { method: "POST", body: { email: "  Jan.Kowalski@EXAMPLE.com ", password: "bardzo-dlugie-haslo" }, expected: 201 });
            assert.equal(created.email, "jan.kowalski@example.com");
            assert.equal(created.role, "USER");
            const stored = await db("users").where({ id: created.id }).first();
            assert.ok(await bcrypt.compare("bardzo-dlugie-haslo", stored.password_hash));
            assert.ok(bcrypt.getRounds(stored.password_hash) >= 10);
            evidence.userRow = stored;
            await request("/api/auth/register", { method: "POST", body: { email: "admin2@example.com", password: "bardzo-dlugie-haslo", role: "ADMIN" }, expected: 400, label: "Próba nadania roli ADMIN" });
            await request("/api/auth/register", { method: "POST", body: { email: "short@example.com", password: "short" }, expected: 400, label: "Zbyt krótkie hasło" });
            await request("/api/auth/register", { method: "POST", body: { email: "extra@example.com", password: "bardzo-dlugie-haslo", isAdmin: true }, expected: 400 });
            await request("/api/auth/register", { method: "POST", body: { email: "long@example.com", password: "a".repeat(73) }, expected: 400 });
            const duplicate = await request("/api/auth/register", { method: "POST", body: { email: "JAN.KOWALSKI@example.COM", password: "bardzo-dlugie-haslo" }, expected: 409, label: "Duplikat różniący się wielkością liter" });
            assert.equal(duplicate.error.code, "EMAIL_TAKEN");
            const results = await Promise.all(Array.from({ length: 10 }, async (_, index) => {
                const response = await fetch(base + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: index % 2 ? "Race@Example.com" : "race@example.com", password: "test-race-password" }) });
                const json = await response.json();
                if (response.status === 409) assert.equal(json.error.code, "EMAIL_TAKEN");
                return response.status;
            }));
            assert.equal(results.filter(code => code === 201).length, 1);
            assert.equal(results.filter(code => code === 409).length, 9);
            evidence.registrationRace = results;
        });
        await t.test("login i JWT: payload minimalny, HS256 i identyczne błędy", async () => {
            const loggedIn = await login("USER@EXAMPLE.COM", "User-demo-2026!");
            ownerToken = loggedIn.accessToken;
            otherToken = (await login("other@example.com", "Other-demo-2026!")).accessToken;
            adminToken = (await login(config.SEED_ADMIN_EMAIL, config.SEED_ADMIN_PASSWORD)).accessToken;
            const decoded = jwt.decode(ownerToken, { complete: true });
            assert.equal(decoded.header.alg, "HS256");
            assert.deepEqual(Object.keys(decoded.payload).sort(), ["exp", "iat", "role", "sub"]);
            assert.equal(decoded.payload.sub, "2");
            assert.equal(decoded.payload.exp - decoded.payload.iat, 900);
            evidence.token = decoded;
            const wrongEmail = await request("/api/auth/login", { method: "POST", body: { email: "missing@example.com", password: "wrong-password" }, expected: 401 });
            const wrongPassword = await request("/api/auth/login", { method: "POST", body: { email: "user@example.com", password: "wrong-password" }, expected: 401 });
            assert.equal(wrongEmail.error.code, wrongPassword.error.code);
            assert.equal(wrongEmail.error.message, wrongPassword.error.message);
            evidence.invalidLogin = { wrongEmail, wrongPassword, note: "code i message identyczne; requestId jest unikalne dla każdego requestu." };
            assert.equal((await request("/api/auth/me", { token: ownerToken })).email, "user@example.com");
        });
        await t.test("authenticate: wszystkie błędy tokenu, algorytm i rzeczywiste wygaśnięcie 10s", async () => {
            await request("/api/auth/me", { expected: 401, label: "Brak Authorization" });
            await request("/api/auth/me", { authorization: "Basic abc", expected: 401, label: "Zły schemat Basic" });
            await request("/api/auth/me", { authorization: "Bearer", expected: 401, label: "Bearer bez tokenu" });
            const parts = ownerToken.split(".");
            const invalidSignature = `${parts[0]}.${parts[1]}.${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
            await request("/api/auth/me", { token: invalidSignature, expected: 401, label: "Zmieniony podpis" });
            const forged = Buffer.from(JSON.stringify({ ...jwt.decode(ownerToken), role: "ADMIN" })).toString("base64url");
            await request("/api/auth/me", { token: `${parts[0]}.${forged}.${parts[2]}`, expected: 401, label: "Zmieniony payload z rolą ADMIN, oryginalny podpis" });
            await request("/api/auth/me", { token: jwt.sign({ role: "ADMIN" }, config.JWT_SECRET, { algorithm: "HS384", subject: "1", expiresIn: "15m" }), expected: 401, label: "Algorytm HS384" });
            await request("/api/auth/me", { token: jwt.sign({ role: "ADMIN" }, null, { algorithm: "none", subject: "1" }), expected: 401, label: "Algorytm none" });
            const shortBase = await listen({ JWT_EXPIRES_IN: "10s" });
            const short = await request("/api/auth/login", { target: shortBase, method: "POST", body: { email: "user@example.com", password: "User-demo-2026!" } });
            const payload = jwt.decode(short.accessToken);
            assert.equal(payload.exp - payload.iat, 10);
            await request("/api/auth/me", { target: shortBase, token: short.accessToken });
            await new Promise(resolve => setTimeout(resolve, (payload.exp + 1) * 1000 - Date.now()));
            const expired = await request("/api/auth/me", { target: shortBase, token: short.accessToken, expected: 401, label: "Rzeczywiście wygasły token po JWT_EXPIRES_IN=10s" });
            assert.equal(expired.error.code, "TOKEN_EXPIRED");
            assert.equal(expired.error.message, "Token expired");
        });
        await t.test("macierz ról i ownership dla wszystkich chronionych endpointów", async () => {
            const actors = [null, ownerToken, otherToken, adminToken];
            const rows = [
                ["GET", "/api/auth/me", null, [401, 200, 200, 200]],
                ["GET", "/api/buildings", null, [401, 200, 200, 200]],
                ["GET", "/api/buildings/1", null, [401, 200, 200, 200]],
                ["GET", "/api/buildings/1/rooms", null, [401, 200, 200, 200]],
                ["GET", "/api/rooms", null, [401, 200, 200, 200]],
                ["GET", "/api/rooms/1", null, [401, 200, 200, 200]],
                ["GET", "/api/reservations", null, [401, 200, 200, 200]],
                ["GET", "/api/reservations/1", null, [401, 200, 404, 200]],
                ["PATCH", "/api/reservations/1/cancel", null, [401, 200, 404, 200]],
                ["POST", "/api/buildings", { name: "Matrix building", address: "Testowa 1" }, [401, 403, 403, 201]],
                ["PATCH", "/api/buildings/3", { address: "Zmieniona 2" }, [401, 403, 403, 200]],
                ["DELETE", "/api/buildings/3", null, [401, 403, 403, 204]],
                ["POST", "/api/rooms", { buildingId: 1, name: "Matrix room", capacity: 30 }, [401, 403, 403, 201]],
                ["PATCH", "/api/rooms/6", { capacity: 35 }, [401, 403, 403, 200]],
                ["DELETE", "/api/rooms/6", null, [401, 403, 403, 204]],
                ["POST", "/api/reservations", actor => ({ roomId: 5, participants: 5, startTime: `2092-01-0${actor + 1}T10:00:00Z`, endTime: `2092-01-0${actor + 1}T11:00:00Z` }), [401, 201, 201, 201]]
            ];
            for (const [method, path, input, expected] of rows) {
                const statuses = [];
                for (let actor = 0; actor < actors.length; actor++) {
                    const body = typeof input === "function" ? input(actor) : input || undefined;
                    await request(path, { method, body, token: actors[actor], expected: expected[actor], label: `Macierz: ${["brak tokenu", "USER właściciel", "USER obcy", "ADMIN"][actor]}` });
                    statuses.push(evidence.requests.at(-1).status);
                }
                evidence.matrix.push({ method, path, statuses });
            }
            const reservations = await request("/api/reservations?limit=100", { token: ownerToken });
            assert.ok(reservations.data.length > 0 && reservations.data.every(row => row.user.id === 2));
            assert.ok(reservations.data.every(row => row.reservedBy === undefined && row.userId === undefined));
            const other = await request("/api/reservations?limit=100", { token: otherToken });
            assert.ok(other.data.every(row => row.user.id === 3));
            await request("/api/reservations?userId=3", { token: ownerToken, expected: 403 });
            const filtered = await request("/api/reservations?userId=3&buildingId=2&limit=1&sort=-participants", { token: adminToken });
            assert.ok(filtered.data.every(row => row.user.id === 3));
            const service = createReservationsService(createKnexUnitOfWork(db));
            await assert.rejects(service.getReservationById(1, { id: 3, role: "USER" }), error => error.statusCode === 404);
            await assert.rejects(service.cancelReservation(1, { id: 3, role: "USER" }), error => error.statusCode === 404);
        });
        await t.test("własność z tokenu i reguły biznesowe również dla ADMIN", async () => {
            const input = { roomId: 5, participants: 5, startTime: "2093-01-01T10:00:00Z", endTime: "2093-01-01T11:00:00Z" };
            for (const extra of [{ userId: 3 }, { reservedBy: "Someone else" }]) {
                await request("/api/reservations", { method: "POST", token: ownerToken, body: { ...input, ...extra }, expected: 400 });
            }
            const own = await request("/api/reservations", { method: "POST", token: ownerToken, body: input, expected: 201 });
            assert.equal(own.user.id, 2);
            await request("/api/reservations", { method: "POST", token: adminToken, body: input, expected: 409 });
            await request("/api/reservations", { method: "POST", token: adminToken, body: { ...input, participants: 999 }, expected: 409 });
            await request("/api/reservations/4/cancel", { method: "PATCH", token: adminToken, expected: 409 });
            await request("/api/buildings/1", { method: "DELETE", token: adminToken, expected: 409 });
            await request("/api/rooms/1", { method: "DELETE", token: adminToken, expected: 409 });
            await request("/api/reservations", { method: "POST", token: adminToken, body: { ...input, startTime: "2025-01-01T10:00:00Z", endTime: "2025-01-01T11:00:00Z" }, expected: 400 });
        });
        await t.test("fail-fast konfiguracja, publiczne Swagger i wspólny schemat błędu", async () => {
            for (const overrides of [{ JWT_SECRET: "short" }, { DATABASE_URL: "not-a-postgres-url" }, { JWT_EXPIRES_IN: "forever" }]) {
                const result = spawnSync(process.execPath, ["src/server.js"], { env: childEnvironment(overrides), encoding: "utf8", timeout: 5000, windowsHide: true });
                assert.notEqual(result.status, 0);
                assert.match(result.stderr, /Invalid configuration/);
                assert.ok(!result.stdout.includes("Server running"));
                assert.ok(!result.stderr.includes(config.JWT_SECRET));
                evidence.configuration.push({ overrides, exitCode: result.status, log: result.stderr });
            }
            const docs = await fetch(base + "/api/docs/");
            assert.equal(docs.status, 200);
            assert.match(await docs.text(), /swagger-ui/);
            const spec = await (await fetch(base + "/api/docs/openapi.json")).json();
            assert.equal(spec.components.securitySchemes.bearerAuth.scheme, "bearer");
            let operations = 0;
            for (const entry of Object.values(spec.paths)) for (const [method, operation] of Object.entries(entry)) {
                if (!["get", "post", "patch", "delete"].includes(method)) continue;
                operations++;
                for (const [status, response] of Object.entries(operation.responses)) {
                    if (Number(status) >= 400) assert.ok(response.$ref.startsWith("#/components/responses/Error"));
                }
            }
            assert.equal(operations, 21);
            evidence.checks.push("Swagger: 21 operacji, bearerAuth, wspólne $ref błędów, dokumentacja publiczna.");
            const history = spawnSync("git", ["log", "-p", "--all"], { encoding: "utf8", windowsHide: true });
            evidence.gitHistory = { exitCode: history.status, result: history.status === 0
                ? (history.stdout.split(/\r?\n/).some(line => /JWT_SECRET=|password=/i.test(line)) ? "Potential secret patterns found; manual review required" : "No matching secret patterns")
                : history.stderr.trim() };
        });
        fs.mkdirSync("reports/generated/zad4", { recursive: true });
        fs.writeFileSync("reports/generated/zad4/evidence.json", JSON.stringify(evidence, null, 2));
        fs.writeFileSync("test_04.results.http", evidence.requests.map(record =>
            `### ${record.label || "Test"}\n${record.method} ${record.path}\n${record.requestBody ? JSON.stringify(record.requestBody) + "\n" : ""}# HTTP ${record.status}\n${JSON.stringify(record.response, null, 2)}\n`).join("\n"));
    } finally {
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
        if (db) await db.destroy();
        await admin.raw("DROP DATABASE IF EXISTS ?? WITH (FORCE)", [databaseName]);
        await admin.destroy();
    }
});
