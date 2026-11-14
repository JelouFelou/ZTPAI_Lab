# Porównanie services: zestaw 02 → zestaw 03

## Tworzenie rezerwacji

Przed zmianą service otrzymywał `roomsRepository` i `reservationsRepository`. Funkcja `createReservation(input)` wykonywała kolejno:

```js
const room = await roomsRepository.findById(input.roomId);
// Brak sali: NotFoundError. Przekroczenie capacity: ConflictError.
// Walidacja czasu: koniec > początek, brak przeszłości, 15 min–8 h.
const activeReservations = await reservationsRepository.findActiveByRoomId(input.roomId);
// Nakładanie: start < bEnd && bStart < end. Konflikt: ROOM_ALREADY_BOOKED.
return reservationsRepository.create(input);
```

Po zmianie ten sam blok reguł jest wykonywany przez repositories związane z transakcją:

```js
return runInTransaction(async ({ roomsRepository, reservationsRepository }) => {
    await roomsRepository.lockById(input.roomId);
    // Dalej te same reguły pojemności, czasu i nakładania co w zestawie 02.
    // Wszystkie odczyty i zapis używają repositories otrzymanych w callbacku.
    return reservationsRepository.create(input);
});
```

Service nie importuje Knex, nie zna nazw tabel ani kolumn. Zmiana implementacji danych odbywa się w `server.js`. Blokujemy wiersz sali, ponieważ istnieje również wtedy, kiedy sala nie ma żadnych rezerwacji. Blokowanie samych rezerwacji nie chroniłoby pustej sali przed dwoma równoległymi zapisami.

## Pozostałe zmiany

Reguły anulowania pozostają takie same: idempotentne CANCELLED, zakaz anulowania rozpoczętej rezerwacji oraz przejście CONFIRMED → CANCELLED. Nowe `getReservationById` dodaje odczyt pojedynczego zasobu i 404. `listReservations` sprawdza kolejność `from`/`to` oraz składa metadane paginacji z wyniku repository.

Rooms service zachowuje listowanie i odczyt pojedynczej sali. Nowa metoda `createRoom` sprawdza istnienie budynku i przekazuje zapis do repository. Unikalności pilnuje baza; centralny error handler zamienia 23505 na 409. Nowy buildings service obsługuje listę, odczyt, tworzenie oraz sale budynku.
