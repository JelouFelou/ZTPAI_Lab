const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const knex = require("knex");
const config = require("../knexfile");
const { config: appConfig } = require("../src/config");
const jwt = require("jsonwebtoken");
const adminToken = jwt.sign({ role: "ADMIN" }, appConfig.JWT_SECRET, { algorithm: "HS256", subject: "1", expiresIn: "15m" });
const { createApp } = require("../src/app");
const { createKnexUnitOfWork } = require("../src/db/unitOfWork");
const { runDoubleBooking } = require("../scripts/double-booking");

test("Zestaw 03: integracja z prawdziwym PostgreSQL", async t => {
    // A fresh database keeps these tests independent of the user's API data.
    const databaseName = `room_booking_test_${Date.now()}`;
    const admin = knex(config);
    const url = new URL(config.connection);
    url.pathname = `/${databaseName}`;
    let db;
    const servers = [];
    const evidence = { date: new Date().toISOString(), endpoints: [], queries: {}, races: {}, checks: [] };
    async function listen(dependencies) {
        const server = http.createServer(createApp(dependencies));
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        servers.push(server);
        return `http://127.0.0.1:${server.address().port}`;
    }
    try {
        await admin.raw("CREATE DATABASE ??", [databaseName]);
        db = knex({ ...config, connection: url.toString() });
        await db.migrate.latest();
        await db.migrate.rollback();
        await db.migrate.latest();
        evidence.checks.push("migrate:latest -> rollback -> latest: OK");
        await db.seed.run();
        const firstSeed = await db("reservations").select("*").orderBy("id");
        const firstBuildings = await db("buildings").select("*").orderBy("id");
        const firstRooms = await db("rooms").select("*").orderBy("id");
        await db.seed.run();
        assert.deepEqual(await db("reservations").select("*").orderBy("id"), firstSeed);
        assert.deepEqual(await db("buildings").select("*").orderBy("id"), firstBuildings);
        assert.deepEqual(await db("rooms").select("*").orderBy("id"), firstRooms);
        evidence.checks.push("seed:run dwukrotnie: ID i dane biznesowe identyczne, 2 budynki / 5 sal / 5 rezerwacji");
        const dependencies = createKnexUnitOfWork(db);
        let base = await listen(dependencies);
        async function request(path, { method = "GET", body, expected = 200 } = {}) {
            const queries = [];
            const handler = query => queries.push({ sql: query.sql, bindings: query.bindings });
            db.on("query", handler);
            let response;
            try {
                response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body: body === undefined ? undefined : JSON.stringify(body) });
                const json = await response.json();
                assert.equal(response.status, expected, JSON.stringify(json));
                evidence.endpoints.push({ method, path, status: response.status, body: json, queries });
                return json;
            } finally { db.removeListener("query", handler); }
        }
        await t.test("JOIN, roomsCount, puste budynki, walidacja i unikalność", async () => {
            const buildings = await request("/api/buildings");
            assert.deepEqual(buildings.map(b => b.roomsCount), [3, 2]);
            assert.equal((await request("/api/rooms/1")).building.name, "Budynek A");
            const empty = await request("/api/buildings", { method: "POST", body: { name: "Pusty budynek", address: "Testowa 1" }, expected: 201 });
            assert.deepEqual(await request(`/api/buildings/${empty.id}/rooms`), []);
            assert.equal((await request("/api/buildings")).find(b => b.id === empty.id).roomsCount, 0);
            await request("/api/buildings/999999/rooms", { expected: 404 });
            assert.equal((await request("/api/buildings/1/rooms")).length, 3);
            assert.equal((await request("/api/reservations/1")).room.building.id, 1);
            await request("/api/reservations/999999", { expected: 404 });
            await request("/api/rooms", { method: "POST", body: { buildingId: 999999, name: "101", capacity: 10 }, expected: 404 });
            const duplicate = await request("/api/rooms", { method: "POST", body: { buildingId: 1, name: "101", capacity: 10 }, expected: 409 });
            assert.equal(duplicate.error.code, "UNIQUE_VIOLATION");
            assert.equal(duplicate.error.detail, undefined);
            await request("/api/buildings", { method: "POST", body: { name: "Budynek A", address: "Testowa 1" }, expected: 409 });
            await request("/api/rooms", { method: "POST", body: { buildingId: 1, name: "Nowa", capacity: 0 }, expected: 400 });
            const building = await request("/api/buildings/1");
            assert.equal(building.name, "Budynek A");
            assert.equal(evidence.endpoints.at(-1).queries.length, 1);
            await request("/api/buildings/abc", { expected: 400 });
            await request("/api/buildings/999999", { expected: 404 });
            await request("/api/buildings", { method: "POST", body: { name: "", address: "x", id: 99 }, expected: 400 });
            const newRoom = await request("/api/rooms", { method: "POST", body: { buildingId: empty.id, name: " 101 ", capacity: 30 }, expected: 201 });
            assert.equal(newRoom.name, "101");
            assert.equal(newRoom.building.id, empty.id);
            assert.equal((await request(`/api/buildings/${empty.id}`)).roomsCount, 1);
            assert.equal((await request(`/api/buildings/${empty.id}/rooms`))[0].id, newRoom.id);
            assert.equal(evidence.endpoints.at(-1).queries.length, 2);
            await request(`/api/rooms/${newRoom.id}`);
            assert.equal(evidence.endpoints.at(-1).queries.length, 1);
            await request("/api/reservations/1");
            assert.equal(evidence.endpoints.at(-1).queries.length, 1);
        });
        await t.test("paginacja, filtrowanie przedziałów i sortowanie", async () => {
            const page = await request("/api/reservations?roomId=1&status=CONFIRMED&from=2099-11-10T11:00:00Z&to=2099-11-10T11:30:00Z");
            assert.equal(page.meta.total, 1);
            assert.equal(page.data[0].id, 1);
            assert.equal((await request("/api/reservations?buildingId=1&limit=2&page=1&sort=-participants")).meta.total, 4);
            assert.equal((await request("/api/reservations?status=CANCELLED&sort=-createdAt")).meta.total, 1);
            assert.equal((await request("/api/reservations?page=2&limit=2&sort=startTime")).data.length, 2);
            const outside = await request("/api/reservations?page=99");
            assert.deepEqual(outside.data, []);
            assert.equal(outside.meta.total, 5);
            assert.equal((await request("/api/reservations?from=2099-11-10T12:00:00Z&to=2099-11-10T13:00:00Z&roomId=1")).meta.total, 1);
            for (const query of ["page=0", "limit=101", "sort=name", "roomId=abc", "status=OTHER", "from=2099-11-11T00:00:00Z&to=2099-11-10T00:00:00Z"]) {
                await request(`/api/reservations?${query}`, { expected: 400 });
            }
            const offsetPage = await request("/api/reservations?roomId=1&from=2099-11-10T12:00:00%2B01:00&to=2099-11-10T12:30:00%2B01:00");
            assert.deepEqual(offsetPage.data.map(r => r.id), [1]);
            assert.equal((await request("/api/reservations?from=2099-11-10T12:00:00Z&roomId=1")).meta.total, 1);
            assert.equal((await request("/api/reservations?to=2099-11-10T10:00:00Z&roomId=1")).meta.total, 0);
            for (const sort of ["startTime", "-startTime", "createdAt", "-createdAt", "participants", "-participants"]) {
                const { data } = await request(`/api/reservations?sort=${sort}`);
                const key = sort.replace(/^-/, "");
                const direction = sort.startsWith("-") ? -1 : 1;
                const value = row => key === "participants" ? row[key] : Date.parse(row[key]);
                for (let i = 1; i < data.length; i++) {
                    const difference = value(data[i]) - value(data[i - 1]);
                    assert.ok(difference * direction >= 0, sort);
                    if (difference === 0) assert.ok(data[i].id > data[i - 1].id, `${sort}: id ASC`);
                }
            }
            const first = await request("/api/reservations?sort=-createdAt&page=1&limit=2");
            const second = await request("/api/reservations?sort=-createdAt&page=2&limit=2");
            assert.equal(new Set([...first.data, ...second.data].map(r => r.id)).size, 4);
            evidence.checks.push("Wszystkie 6 sortowań, tie-breaker id ASC, rozłączne strony oraz filtry jednostronne i offset +01:00: OK");
        });
        await t.test("stała liczba zapytań przy 5 i 20 rekordach", async () => {
            await request("/api/reservations");
            evidence.queries.five = evidence.endpoints.at(-1).queries;
            await db("reservations").insert(Array.from({ length: 15 }, (_, i) => ({ room_id: 5, user_id: 2, participants: 5,
                start_time: new Date(Date.UTC(2099, 0, i + 1, 10)), end_time: new Date(Date.UTC(2099, 0, i + 1, 11)), status: "CONFIRMED" })));
            const page = await request("/api/reservations");
            assert.equal(page.meta.total, 20);
            evidence.queries.twenty = evidence.endpoints.at(-1).queries;
            assert.equal(evidence.queries.five.length, 2);
            assert.equal(evidence.queries.twenty.length, 2);
        });
        await t.test("reguły zadania 02, anulowanie i trwałość po restarcie serwera", async () => {
            const body = { roomId: 2, participants: 5, startTime: "2099-11-10T10:00:00Z", endTime: "2099-11-10T12:00:00Z" };
            const created = await request("/api/reservations", { method: "POST", body, expected: 201 });
            await request("/api/reservations", { method: "POST", body, expected: 409 });
            await request("/api/reservations", { method: "POST", body: { ...body, participants: 99 }, expected: 409 });
            await request("/api/reservations", { method: "POST", body: { ...body, endTime: body.startTime }, expected: 400 });
            await request("/api/reservations", { method: "POST", body: { ...body, endTime: "2099-11-10T10:05:00Z" }, expected: 400 });
            await request("/api/reservations", { method: "POST", body: { ...body, startTime: "2025-11-10T10:00:00Z", endTime: "2025-11-10T12:00:00Z" }, expected: 400 });
            const cancelled = await request(`/api/reservations/${created.id}/cancel`, { method: "PATCH" });
            assert.equal(cancelled.status, "CANCELLED");
            assert.equal((await request(`/api/reservations/${created.id}/cancel`, { method: "PATCH" })).cancelledAt, cancelled.cancelledAt);
            await request("/api/reservations/4/cancel", { method: "PATCH", expected: 409 });
            await request("/api/reservations", { method: "POST", body, expected: 201 });
            await request("/api/reservations", { method: "POST", body: { ...body, startTime: body.endTime, endTime: "2099-11-10T13:00:00Z" }, expected: 201 });
            const before = await request(`/api/reservations/${created.id}`);
            await new Promise(resolve => servers[0].close(resolve));
            base = await listen(createKnexUnitOfWork(db));
            const after = await request(`/api/reservations/${created.id}`);
            assert.deepEqual(after, before);
            evidence.persistence = { before, after, note: "Zamknięto serwer HTTP i utworzono nową aplikację z nowymi repositories; baza pozostała ta sama." };
        });
        await t.test("race condition: przed naprawą, po naprawie, sam constraint", async () => {
            const delayCreate = repositories => {
                const original = repositories.reservationsRepository.create.bind(repositories.reservationsRepository);
                repositories.reservationsRepository.create = async input => {
                    await new Promise(resolve => setTimeout(resolve, 200));
                    return original(input);
                };
                return repositories;
            };
            const noOverlapMigration = require("../src/db/migrations/002_reservations_no_overlap");
            await noOverlapMigration.down(db);
            try {
                const unsafe = delayCreate(createKnexUnitOfWork(db));
                unsafe.roomsRepository.lockById = async () => {};
                unsafe.runInTransaction = fn => fn(unsafe);
                const unsafeBase = await listen(unsafe);
                evidence.races.before = await runDoubleBooking({ baseUrl: unsafeBase, database: db, accessToken: adminToken, startTime: "2098-12-01T10:00:00Z", endTime: "2098-12-01T12:00:00Z" });
                assert.ok(evidence.races.before.confirmed > 1);
            } finally {
                await db("reservations").where("start_time", "2098-12-01T10:00:00Z").delete();
                await noOverlapMigration.up(db);
            }
            const fixed = createKnexUnitOfWork(db);
            const transaction = fixed.runInTransaction;
            fixed.runInTransaction = fn => transaction(repositories => fn(delayCreate(repositories)));
            const fixedBase = await listen(fixed);
            evidence.races.fixed = await runDoubleBooking({ baseUrl: fixedBase, database: db, accessToken: adminToken, startTime: "2098-12-02T10:00:00Z", endTime: "2098-12-02T12:00:00Z" });
            const constraintOnly = delayCreate(createKnexUnitOfWork(db));
            constraintOnly.roomsRepository.lockById = async () => {};
            constraintOnly.reservationsRepository.findActiveByRoomId = async () => [];
            constraintOnly.runInTransaction = fn => fn(constraintOnly);
            const constraintBase = await listen(constraintOnly);
            evidence.races.constraintOnly = await runDoubleBooking({ baseUrl: constraintBase, database: db, accessToken: adminToken, startTime: "2098-12-03T10:00:00Z", endTime: "2098-12-03T12:00:00Z" });
            for (const result of [evidence.races.fixed, evidence.races.constraintOnly]) {
                assert.equal(result.confirmed, 1);
                assert.equal(result.results.filter(r => r.status === 201).length, 1);
                assert.equal(result.results.filter(r => r.status === 409).length, 9);
            }
        });
        await t.test("constraint: półotwarte przedziały i CANCELLED", async () => {
            const input = { room_id: 5, user_id: 2, participants: 5, start_time: "2097-01-01T10:00:00Z", end_time: "2097-01-01T12:00:00Z", status: "CONFIRMED" };
            const [row] = await db("reservations").insert(input).returning("id");
            await assert.rejects(db("reservations").insert(input), error => error.code === "23P01");
            await db("reservations").insert({ ...input, start_time: input.end_time, end_time: "2097-01-01T13:00:00Z" });
            await db("reservations").where({ id: row.id }).update({ status: "CANCELLED", cancelled_at: db.fn.now() });
            await db("reservations").insert(input);
            evidence.checks.push("SQL: nakładanie odrzucone (23P01); stykające się przedziały i ponowna rezerwacja po anulowaniu: OK");
        });
        fs.mkdirSync("reports/generated", { recursive: true });
        fs.writeFileSync("reports/generated/evidence.json", JSON.stringify(evidence, null, 2));
    } finally {
        await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))));
        if (db) await db.destroy();
        await admin.raw("DROP DATABASE IF EXISTS ?? WITH (FORCE)", [databaseName]);
        await admin.destroy();
        await require("../src/db/knex").destroy();
    }
});
