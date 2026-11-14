const { toReservationResponse } = require("./reservations.mapper");

function createReservationsController(reservationsService) {
    return {
        async list(req, res) {
            const { items, meta } = await reservationsService.listReservations(req.validated.query, req.user);
            res.json({ data: items.map(toReservationResponse), meta });
        },
        async get(req, res) {
            res.json(toReservationResponse(await reservationsService.getReservationById(req.validated.params.id, req.user)));
        },
        async create(req, res) {
            const reservation = await reservationsService.createReservation(req.validated.body, req.user);
            res.status(201)
               .location(`/api/reservations/${reservation.id}`)
               .json(toReservationResponse(reservation));
        },
        async cancel(req, res) {
            const reservation = await reservationsService.cancelReservation(req.validated.params.id, req.user);
            res.json(toReservationResponse(reservation));
        }
    };
}

module.exports = { createReservationsController };

