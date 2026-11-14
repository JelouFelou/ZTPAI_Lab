const { createReservationsService } = require('../../src/modules/reservations/reservations.service');
const { createInMemoryRoomsRepository } = require('../../src/modules/rooms/rooms.repository.memory');
const { createInMemoryReservationsRepository } = require('../../src/modules/reservations/reservations.repository.memory');
const NOW = new Date('2099-01-01T00:00:00Z');
const owner = { id: 2, role: 'USER' }, other = { id: 3, role: 'USER' }, admin = { id: 1, role: 'ADMIN' };
const input = { roomId: 1, participants: 10, startTime: '2099-01-02T10:00:00Z', endTime: '2099-01-02T11:00:00Z' };
const reservation = changes => ({ ...input, id: 1, userId: 2, status: 'CONFIRMED', cancelledAt: null, ...changes });
function setup(seed = [], transaction) {
    const roomsRepository = createInMemoryRoomsRepository([{ id: 1, capacity: 10 }, { id: 2, capacity: 10 }]);
    const reservationsRepository = createInMemoryReservationsRepository(seed, roomsRepository);
    const eventBus = { publish: jest.fn() };
    const repos = { roomsRepository, reservationsRepository };
    const service = createReservationsService({ ...repos, eventBus, now: () => NOW,
        runInTransaction: transaction ?? (fn => fn(repos)) });
    return { service, eventBus, reservationsRepository };
}
test('creates CONFIRMED reservation owned by current user', async () => {
    const { service } = setup();
    expect(await service.createReservation(input, owner)).toMatchObject({ userId: 2, status: 'CONFIRMED' });
});
test.each([
    ['partial', '10:30', '11:30'], ['contained', '10:15', '10:45'], ['containing', '09:00', '12:00'], ['identical', '10:00', '11:00']
])('rejects overlap: %s', async (_, start, end) => {
    const { service, eventBus } = setup([reservation()]);
    await expect(service.createReservation({ ...input, startTime: `2099-01-02T${start}:00Z`, endTime: `2099-01-02T${end}:00Z` }, owner))
        .rejects.toMatchObject({ code: 'ROOM_ALREADY_BOOKED' });
    expect(eventBus.publish).not.toHaveBeenCalled();
});
test.each([['09:00', '10:00'], ['11:00', '12:00']])('allows touching interval %s to %s', async (start, end) => {
    const { service } = setup([reservation()]);
    await expect(service.createReservation({ ...input, startTime: `2099-01-02T${start}:00Z`, endTime: `2099-01-02T${end}:00Z` }, owner)).resolves.toMatchObject({ status: 'CONFIRMED' });
});
test('another room does not conflict', async () => {
    await expect(setup([reservation({ roomId: 2 })]).service.createReservation(input, owner)).resolves.toBeDefined();
});
test('CANCELLED does not block', async () => {
    await expect(setup([reservation({ status: 'CANCELLED' })]).service.createReservation(input, owner)).resolves.toBeDefined();
});
test('capacity equality allowed', async () => {
    await expect(setup().service.createReservation(input, owner)).resolves.toMatchObject({ participants: 10 });
});
test('capacity plus one rejected', async () => {
    await expect(setup().service.createReservation({ ...input, participants: 11 }, owner)).rejects.toMatchObject({ code: 'CAPACITY_EXCEEDED' });
});
test.each([[15, true], [480, true], [14, false], [481, false]])('duration %i min, allowed=%s', async (minutes, allowed) => {
    const request = { ...input, endTime: new Date(Date.parse(input.startTime) + minutes * 60000).toISOString() };
    const result = setup().service.createReservation(request, owner);
    if (allowed) await expect(result).resolves.toBeDefined();
    else await expect(result).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});
test('cannot cancel a started reservation', async () => {
    await expect(setup([reservation({ startTime: NOW.toISOString() })]).service.cancelReservation(1, owner))
        .rejects.toMatchObject({ code: 'RESERVATION_ALREADY_STARTED' });
});
test('double cancellation preserves timestamp and emits once', async () => {
    const { service, eventBus } = setup([reservation()]);
    const first = await service.cancelReservation(1, owner);
    expect(await service.cancelReservation(1, owner)).toEqual(first);
    expect(first.cancelledAt).toBe(NOW.toISOString());
    expect(eventBus.publish).toHaveBeenCalledTimes(1);
});
test('foreign USER cannot read or cancel', async () => {
    const { service, eventBus } = setup([reservation()]);
    await expect(service.getReservationById(1, other)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.cancelReservation(1, other)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(eventBus.publish).not.toHaveBeenCalled();
});
test('ADMIN cancels foreign reservation with actor and owner', async () => {
    const { service, eventBus } = setup([reservation()]);
    await expect(service.cancelReservation(1, admin)).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(eventBus.publish).toHaveBeenCalledWith('reservation.cancelled', { reservationId: 1, roomId: 1, userId: 2, cancelledBy: 1 });
});
test('publishes creation only after transaction commits', async () => {
    let finish;
    const { service, eventBus } = setup([], () => new Promise(resolve => { finish = resolve; }));
    const pending = service.createReservation(input, owner);
    expect(eventBus.publish).not.toHaveBeenCalled();
    finish(reservation());
    await pending;
    expect(eventBus.publish).toHaveBeenCalledWith('reservation.created', expect.objectContaining({ reservationId: 1, userId: 2 }));
});
test('failed commit never publishes', async () => {
    const { service, eventBus } = setup([], async () => { throw Object.assign(new Error('rollback'), { code: 'ROLLBACK' }); });
    await expect(service.createReservation(input, owner)).rejects.toMatchObject({ code: 'ROLLBACK' });
    await expect(service.cancelReservation(1, owner)).rejects.toMatchObject({ code: 'ROLLBACK' });
    expect(eventBus.publish).not.toHaveBeenCalled();
});
