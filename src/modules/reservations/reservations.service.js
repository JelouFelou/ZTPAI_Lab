const { NotFoundError, ConflictError, ValidationError, ForbiddenError } = require("../../errors/AppError");

const ALLOWED_TRANSITIONS = {
    CONFIRMED: ["CANCELLED"],
    CANCELLED: []
};

function createReservationsService({ reservationsRepository, roomsRepository, runInTransaction, eventBus = require('../../events/eventBus').noopEventBus, now = () => new Date() }) {
    async function createReservation(input, currentUser) {
        const created = await runInTransaction(async ({ roomsRepository, reservationsRepository }) => {
            // Lock the room even when there are no reservations yet.
            await roomsRepository.lockById(input.roomId);
            const room = await roomsRepository.findById(input.roomId);
            if (!room) {
                throw new NotFoundError("Room");
            }

            if (input.participants > room.capacity) {
                throw new ConflictError("Room capacity exceeded", "CAPACITY_EXCEEDED");
            }

            const start = new Date(input.startTime).getTime();
            const end = new Date(input.endTime).getTime();
            const currentTime = now().getTime();

            if (end <= start) {
                throw new ValidationError([
                    { location: "body", field: "endTime", message: "endTime must be after startTime" }
                ]);
            }
            if (start < currentTime) {
                throw new ValidationError([
                    { location: "body", field: "startTime", message: "startTime cannot be in the past" }
                ]);
            }

            const durationMinutes = (end - start) / (1000 * 60);
            if (durationMinutes < 15 || durationMinutes > 480) {
                throw new ValidationError([
                    { location: "body", field: "duration", message: "Reservation duration must be between 15 minutes and 8 hours" }
                ]);
            }

            const activeReservations = await reservationsRepository.findActiveByRoomId(input.roomId);
            const hasOverlap = activeReservations.some(b => {
                const bStart = new Date(b.startTime).getTime();
                const bEnd = new Date(b.endTime).getTime();
                return start < bEnd && bStart < end;
            });

            if (hasOverlap) {
                throw new ConflictError("Room is already booked in this time interval", "ROOM_ALREADY_BOOKED");
            }

            return reservationsRepository.create({ ...input, userId: currentUser.id });
        });
        eventBus.publish('reservation.created', { reservationId: created.id, roomId: created.roomId,
            userId: created.userId, startTime: created.startTime, endTime: created.endTime });
        return created;
    }

    function assertOwnership(reservation, currentUser) {
        if (!reservation || (currentUser.role !== "ADMIN" && reservation.userId !== currentUser.id)) {
            throw new NotFoundError("Reservation");
        }
    }

    async function cancelReservation(id, currentUser) {
        const result = await runInTransaction(async ({ reservationsRepository, roomsRepository }) => {
        // Same lock order as create: serialize cancellation and prevent duplicate events.
        const existing = await reservationsRepository.findById(id);
        assertOwnership(existing, currentUser);
        await roomsRepository.lockById(existing.roomId);
        const reservation = await reservationsRepository.findById(id);
        assertOwnership(reservation, currentUser);

        if (reservation.status === "CANCELLED") {
            return { reservation, changed: false };
        }

        const start = new Date(reservation.startTime).getTime();
        if (start <= now().getTime()) {
            throw new ConflictError("Cannot cancel reservation that has already started", "RESERVATION_ALREADY_STARTED");
        }

        if (!(ALLOWED_TRANSITIONS[reservation.status] || []).includes("CANCELLED")) {
            throw new ConflictError(`Cannot transition from ${reservation.status} to CANCELLED`, "INVALID_TRANSITION");
        }

        const updated = await reservationsRepository.update(id, {
            status: "CANCELLED",
            cancelledAt: now().toISOString()
        });
        return { reservation: updated, changed: true };
        });
        const reservation = result.reservation;
        if (result.changed) eventBus.publish('reservation.cancelled', {
            reservationId: reservation.id, roomId: reservation.roomId, userId: reservation.userId, cancelledBy: currentUser.id
        });
        return reservation;
    }

    async function listReservations(filters, currentUser) {
        if (currentUser.role !== "ADMIN" && filters.userId !== undefined) {
            throw new ForbiddenError("Only ADMIN can use the userId filter");
        }
        if (filters.from && filters.to && new Date(filters.from) >= new Date(filters.to)) {
            throw new ValidationError([{ location: "query", field: "to", message: "to must be after from" }]);
        }
        const scopedFilters = currentUser.role === "ADMIN" ? filters : { ...filters, userId: currentUser.id };
        const { items, total } = await reservationsRepository.findAll(scopedFilters);
        return { items, meta: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
    }

    async function getReservationById(id, currentUser) {
        const reservation = await reservationsRepository.findById(id);
        assertOwnership(reservation, currentUser);
        return reservation;
    }
    return { createReservation, cancelReservation, listReservations, getReservationById };
}

module.exports = { createReservationsService };

