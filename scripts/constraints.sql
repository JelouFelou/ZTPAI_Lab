\set ON_ERROR_STOP off
\set VERBOSITY verbose
\pset pager off
\d reservations
-- Each failing statement runs in its own savepoint; no test data is retained.
BEGIN;
\echo 'buildings.name UNIQUE / expected 23505'
SAVEPOINT probe;
INSERT INTO buildings (name, address) VALUES ('Budynek A', 'Test');
ROLLBACK TO SAVEPOINT probe;
\echo 'buildings PRIMARY KEY / expected 23505'
SAVEPOINT probe;
INSERT INTO buildings (id, name, address) VALUES (1, 'PK probe', 'Test');
ROLLBACK TO SAVEPOINT probe;
\echo 'buildings NOT NULL / expected 23502'
SAVEPOINT probe;
INSERT INTO buildings (name, address) VALUES (NULL, 'Test');
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms (building_id,name) UNIQUE / expected 23505'
SAVEPOINT probe;
INSERT INTO rooms (building_id, name, capacity) VALUES (1, '101', 10);
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms.capacity CHECK / expected 23514'
SAVEPOINT probe;
INSERT INTO rooms (building_id, name, capacity) VALUES (1, 'CHECK probe', 0);
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms.building_id FOREIGN KEY / expected 23503'
SAVEPOINT probe;
INSERT INTO rooms (building_id, name, capacity) VALUES (999999, 'FK probe', 10);
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms PRIMARY KEY / expected 23505'
SAVEPOINT probe;
INSERT INTO rooms (id, building_id, name, capacity) VALUES (1, 1, 'PK probe', 10);
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms NOT NULL / expected 23502'
SAVEPOINT probe;
INSERT INTO rooms (building_id, name, capacity) VALUES (1, NULL, 10);
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations end_time CHECK / expected 23514'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time) VALUES (5,2,5,'2099-01-01 12:00Z','2099-01-01 10:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations status CHECK / expected 23514'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time,status) VALUES (5,2,5,'2099-01-01 10:00Z','2099-01-01 12:00Z','OTHER');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations participants CHECK / expected 23514'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time) VALUES (5,2,0,'2099-01-01 10:00Z','2099-01-01 12:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations.room_id FOREIGN KEY / expected 23503'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time) VALUES (999999,2,5,'2099-01-01 10:00Z','2099-01-01 12:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations PRIMARY KEY / expected 23505'
SAVEPOINT probe;
INSERT INTO reservations (id,room_id,user_id,participants,start_time,end_time) VALUES (1,5,2,5,'2099-01-01 10:00Z','2099-01-01 12:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations NOT NULL / expected 23502'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time) VALUES (5,NULL,5,'2099-01-01 10:00Z','2099-01-01 12:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'reservations EXCLUDE overlap / expected 23P01'
SAVEPOINT probe;
INSERT INTO reservations (room_id,user_id,participants,start_time,end_time) VALUES (1,2,5,'2099-11-10 11:00Z','2099-11-10 13:00Z');
ROLLBACK TO SAVEPOINT probe;
\echo 'buildings ON DELETE RESTRICT / expected 23503'
SAVEPOINT probe;
DELETE FROM buildings WHERE id=1;
ROLLBACK TO SAVEPOINT probe;
\echo 'rooms ON DELETE RESTRICT / expected 23503'
SAVEPOINT probe;
DELETE FROM rooms WHERE id=1;
ROLLBACK TO SAVEPOINT probe;
ROLLBACK;
