const express = require("express");

const app = express();

app.use(express.json());

const rooms = [
    {
        id: 1,
        name: "A101",
        capacity: 30
    },
    {
        id: 2,
        name: "A102",
        capacity: 20
    },
    {
        id: 3,
        name: "B201",
        capacity: 50
    },
    {
        id: 4,
        name: "B202",
        capacity: 15
    }
];

const reservations = [];

app.get("/api/rooms", (req, res) => {
    res.json(rooms);
});

app.get("/api/rooms/:id", (req, res) => {
    const id = Number(req.params.id);

    const room = rooms.find(room => room.id === id);

    if (!room) {
        return res.status(404).json({
            message: "Room not found"
        });
    }

    res.json(room);
});

// Zadanie 4: Pobieranie i filtrowanie rezerwacji
app.get("/api/reservations", (req, res) => {
    const { roomId } = req.query;

    if (roomId !== undefined) {
        const filteredReservations = reservations.filter(
            reservation => reservation.roomId === Number(roomId)
        );
        return res.json(filteredReservations);
    }

    res.json(reservations);
});

app.post("/api/reservations", (req, res) => {
    const {
        roomId,
        reservedBy,
        participants,
        date
    } = req.body;

    if (!roomId || !reservedBy || !participants || !date) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    if (typeof participants !== "number" || participants <= 0) {
        return res.status(400).json({
            message: "Participants must be a number greater than 0"
        });
    }

    const room = rooms.find(room => room.id === Number(roomId));

    if (!room) {
        return res.status(404).json({
            message: "Room not found"
        });
    }

    if (participants > room.capacity) {
        return res.status(409).json({
            message: "Room capacity exceeded"
        });
    }

    const reservation = {
        id: reservations.length + 1,
        roomId: Number(roomId),
        reservedBy,
        participants,
        date,
        status: "CONFIRMED"
    };

    reservations.push(reservation);

    res.status(201).json(reservation);
});

// Zadanie 5: Anulowanie rezerwacji
app.patch("/api/reservations/:id/cancel", (req, res) => {
    const id = Number(req.params.id);
    const reservation = reservations.find(res => res.id === id);

    if (!reservation) {
        return res.status(404).json({
            message: "Reservation not found"
        });
    }

    reservation.status = "CANCELLED";

    res.json(reservation);
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});