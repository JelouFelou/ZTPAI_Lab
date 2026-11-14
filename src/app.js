const express = require("express");
const requestLogger = require("./middleware/requestLogger");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");
const swaggerUi = require("swagger-ui-express");
const openapi = require("./docs/openapi");
const { createAuthenticate } = require("./middleware/authenticate");
const { createAuthService } = require("./modules/auth/auth.service");
const { createAuthController } = require("./modules/auth/auth.controller");
const { createPublicAuthRouter } = require("./modules/auth/auth.routes");
const { createBuildingsService } = require("./modules/buildings/buildings.service");
const { createBuildingsController } = require("./modules/buildings/buildings.controller");
const { createBuildingsRouter } = require("./modules/buildings/buildings.routes");

const { createRoomsService } = require("./modules/rooms/rooms.service");
const { createRoomsController } = require("./modules/rooms/rooms.controller");
const { createRoomsRouter } = require("./modules/rooms/rooms.routes");

const { createReservationsService } = require("./modules/reservations/reservations.service");
const { createReservationsController } = require("./modules/reservations/reservations.controller");
const { createReservationsRouter } = require("./modules/reservations/reservations.routes");

function createApp({ roomsRepository, reservationsRepository, buildingsRepository, usersRepository, auditRepository, eventBus, runInTransaction, now, config = require("./config").config }) {
    const app = express();

    app.use(requestLogger);
    app.get("/api/docs/openapi.json", (req, res) => res.json(openapi));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapi));
    const authController = createAuthController(createAuthService({ usersRepository, config }));
    app.use("/api/auth", createPublicAuthRouter(authController));
    app.use(createAuthenticate(config));
    app.use(express.json());
    app.get("/api/auth/me", authController.me);

    // Moduł Rooms
    const roomsService = createRoomsService({ roomsRepository, buildingsRepository });
    const roomsController = createRoomsController(roomsService);
    app.use("/api/rooms", createRoomsRouter(roomsController));

    // Moduł Reservations
    const reservationsService = createReservationsService({ reservationsRepository, roomsRepository, runInTransaction, now, eventBus });
    const reservationsController = createReservationsController(reservationsService);
    app.use("/api/reservations", createReservationsRouter(reservationsController));
    const buildingsService = createBuildingsService({ buildingsRepository, roomsRepository });
    app.use("/api/buildings", createBuildingsRouter(createBuildingsController(buildingsService)));

    const { z } = require('zod');
    const { authorize } = require('./middleware/authorize');
    const validate = require('./middleware/validate');
    app.get('/api/admin/audit-log', authorize('ADMIN'), validate({ query: z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        eventType: z.enum(['reservation.created', 'reservation.cancelled']).optional()
    }).strict() }), async (req, res) => {
        res.json(auditRepository ? await auditRepository.findAll(req.validated.query) : {
            data: [], meta: { ...req.validated.query, total: 0, totalPages: 0 }
        });
    });
    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };

