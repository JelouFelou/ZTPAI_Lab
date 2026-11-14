const { createKnexBuildingsRepository } = require("../modules/buildings/buildings.repository.knex");
const { createKnexRoomsRepository } = require("../modules/rooms/rooms.repository.knex");
const { createKnexReservationsRepository } = require("../modules/reservations/reservations.repository.knex");
const { createKnexUsersRepository } = require("../modules/auth/auth.repository.knex");
function createKnexRepositories(db) {
    return { buildingsRepository: createKnexBuildingsRepository(db), roomsRepository: createKnexRoomsRepository(db),
        reservationsRepository: createKnexReservationsRepository(db), usersRepository: createKnexUsersRepository(db) };
}
function createKnexUnitOfWork(db) {
    return { ...createKnexRepositories(db), auditRepository: require('../modules/audit/audit.repository.knex').createAuditRepository(db), runInTransaction: fn => db.transaction(trx => fn(createKnexRepositories(trx))) };
}
module.exports = { createKnexUnitOfWork };
