const { config } = require("./config");
const { createApp } = require("./app");
let dependencies;
let db;
if (config.REPOSITORY === "memory") {
    const { createInMemoryBuildingsRepository } = require("./modules/buildings/buildings.repository.memory");
    const { createInMemoryRoomsRepository } = require("./modules/rooms/rooms.repository.memory");
    const { createInMemoryReservationsRepository } = require("./modules/reservations/reservations.repository.memory");
    const { createInMemoryUsersRepository } = require("./modules/auth/auth.repository.memory");
    const bcrypt = require("bcryptjs");
    const usersRepository = createInMemoryUsersRepository([
        { id: 1, email: config.SEED_ADMIN_EMAIL, passwordHash: bcrypt.hashSync(config.SEED_ADMIN_PASSWORD, config.BCRYPT_COST), role: "ADMIN", createdAt: new Date().toISOString() },
        { id: 2, email: "user@example.com", passwordHash: bcrypt.hashSync("User-demo-2026!", config.BCRYPT_COST), role: "USER", createdAt: new Date().toISOString() }
    ]);
    const buildingsRepository = createInMemoryBuildingsRepository();
    const roomsRepository = createInMemoryRoomsRepository(undefined, buildingsRepository);
    const reservationsRepository = createInMemoryReservationsRepository(undefined, roomsRepository, usersRepository);
    const repositories = { buildingsRepository, roomsRepository, reservationsRepository, usersRepository };
    dependencies = { ...repositories, runInTransaction: fn => fn(repositories) };
} else {
    db = require("./db/knex");
    dependencies = require("./db/unitOfWork").createKnexUnitOfWork(db);
}
const port = config.PORT;
const eventBus = require('./events/eventBus').createEventBus();
if (db) require('./events/auditListeners').registerAuditListeners(eventBus, db);
const server = createApp({ ...dependencies, config, eventBus }).listen(port, () => console.log(`Server running on http://localhost:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => { console.log(`[shutdown] ${signal}: closing HTTP server`); server.close(async () => {
        await eventBus.drain();
        if (db) await db.destroy();
        console.log('[shutdown] HTTP closed, listeners drained, database pool closed');
        process.exit(0);
    }); });
}
