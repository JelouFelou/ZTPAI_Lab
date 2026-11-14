// Optional tooling: npm install --prefix .tools --no-package-lock playwright-core
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { chromium } = require('../.tools/node_modules/playwright-core');
const directory = 'reports/generated/zad5';
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pre = value => `<pre>${esc(value)}</pre>`;
const source = file => `<h3>${esc(file)}</h3>${pre(fs.readFileSync(file, 'utf8'))}`;
const excerpt = (file, start, end) => fs.readFileSync(file, 'utf8').split('\n').slice(start - 1, end).join('\n');
const picture = name => `<img src="data:image/png;base64,${fs.readFileSync(`screenshots/zad5/${name}.png`).toString('base64')}">`;
const pages = [];
const page = (title, body) => pages.push(`<section><h2>${title}</h2>${body}</section>`);
const screen = (title, text, file) => page(title, `<p>${text}</p><figure>${picture(file)}</figure>`);
const link = (url, label = url) => `<a href="${esc(url)}">${esc(label)}</a>`;
const readJson = file => {
    const buffer = fs.readFileSync(file);
    return JSON.parse(buffer.toString(buffer[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
};
async function main() {
    fs.mkdirSync(directory, { recursive: true });
    const tag = require('node:child_process').spawnSync('git', ['rev-parse', '--verify', 'zadanie-05^{commit}'], { encoding: 'utf8' });
    const sha = tag.status === 0 ? tag.stdout.trim() : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const repo = 'https://github.com/JelouFelou/ZTPAI_Lab';
    const red = `${repo}/actions/runs/43617435186`, green = `${repo}/actions/runs/43617636286`;
    const demo = readJson('reports/zad5-evidence.json');
    page('Room Booking API — zestaw 05', `<p class="author">Adrian Bober • 14 listopada 2026</p>
        <p>Testy, Docker Compose, eventy i Continuous Integration.</p>
        <p>Repozytorium: ${link(repo)}<br>Oceniana wersja kodu: ${link(`${repo}/commit/${sha}`, sha)}<br>PR demonstracyjny: ${link(`${repo}/pull/1`)}</p>
        <table><tr><th>Część</th><th>Weryfikacja</th></tr>
        <tr><td>1. Testy unitowe</td><td>22 testy bez bazy; mutacja reguły wykryta przez 2 testy graniczne</td></tr>
        <tr><td>2. Integracja</td><td>10 testów Supertest + PostgreSQL, własna baza i reset przed każdym testem</td></tr>
        <tr><td>3. Docker</td><td>API i db, 5 migracji od zera, healthcheck, wolumen, SIGTERM</td></tr>
        <tr><td>4. Eventy</td><td>Po COMMIT, JSONB audit log, notification, izolacja awarii</td></tr>
        <tr><td>5. CI</td><td>PR #1: failure → poprawka → success → merge; build obrazu w CI</td></tr></table>
        <p>Zrzuty terminala wykonano w prawdziwym oknie Visual Studio Code; obrazy Swaggera i GitHuba pochodzą z przeglądarki. Pełne PNG znajdują się w screenshots/zad5/. Kod i konfiguracja są przedstawione jako tekst, a wyniki działania jako zrzuty ekranu.</p>`);
    page('1. Unit testy — własny stan, stały zegar i granice', `<p>Każde setup() tworzy nowe repositories in-memory, a czas jest wstrzyknięty jako now(). Asercje błędów sprawdzają code. test.each pokrywa nakładanie i długość rezerwacji. Testy wykonano także przy zatrzymanym kontenerze PostgreSQL.</p>
        <div class="columns"><div><h3>Przygotowanie testu</h3>${pre(excerpt('tests/unit/reservations.service.test.js', 1, 18))}</div>
        <div><h3>Przykłady przypadków granicznych</h3>${pre(excerpt('tests/unit/reservations.service.test.js', 29, 36))}${pre(excerpt('tests/unit/reservations.service.test.js', 46, 53))}
        <p>Sprawdzone: częściowe nakładanie, zawieranie w obie strony, identyczne i stykające się przedziały, inna sala, CANCELLED, capacity i capacity+1, 15/480/14/481 minut, rozpoczęta rezerwacja, idempotencja cancelledAt, cudzy USER, ADMIN i publikacja eventów.</p></div></div>`);
    screen('1.1. Wynik npm run test:unit', 'Dwa zestawy, 22 testy zaliczone. Testy service używają wyłącznie fake repositories; EventBus jest sprawdzany osobno.', '01-unit-tests');
    screen('1.2. Kontrola jakości: celowy błąd granicy przedziału', 'Skrypt tymczasowo zmienił oba operatory &lt; na &lt;=. Dwa testy stykających się przedziałów wykryły błąd (2 failed, 19 passed). Blok finally przywrócił poprawny kod. Końcowy wynik pełnego zestawu jest zielony.', '04-mutation-detected');
    page('2. Izolacja integracji i konfiguracja Jest', `<div class="columns"><div>${source('jest.config.js')}${source('tests/setupEnv.js')}</div><div>
        <h3>Inicjalizacja i sprzątanie bazy</h3>${pre(excerpt('tests/integration/reservations.api.test.js', 16, 41))}
        <p>Połączenie administracyjne służy wyłącznie do utworzenia i usunięcia unikalnej bazy room_booking_test05_*. Nie wymaga istniejącej bazy testowej. Migracje uruchamia beforeAll; beforeEach czyści wszystkie tabele tej własnej bazy. drain() i destroy() zamykają pracę asynchroniczną oraz pule.</p></div></div>`);
    page('2.1. Integracja: HTTP, nagłówek Location i zapis SQL', `<p>Supertest otrzymuje createApp() bez ręcznego uruchamiania server.js ani listen(). Każdy test ma osobny stan. Poniższy przykład sprawdza nie tylko odpowiedź 201, ale też trwały rekord w bazie.</p>
        ${pre(excerpt('tests/integration/reservations.api.test.js', 42, 61))}
        <p>Pozostałe testy: rejestracja/logowanie/me; 400 i details; 401 bez tokenu; 403 przy tworzeniu sali przez USER; 404 cudzej rezerwacji; 409 ROOM_ALREADY_BOOKED; paginacja total=5, data.length=2; scenariusz audit logu i awaria listenera. Łącznie 10 testów integracyjnych i 22 unitowe. Dodatkowo starszy zestaw regresyjny: 15/15.</p>`);
    screen('2.2. Wynik npm test', '3 zestawy, 32 testy zaliczone; proces zakończył się bez ostrzeżenia o open handles. Widoczny błąd listenera pochodzi z celowego testu izolacji i nie oznacza niepowodzenia testów.', '02-all-tests');
    page('3. Konteneryzacja', `<div class="columns"><div>${source('Dockerfile')}${source('.dockerignore')}
        <p>Zależności są instalowane przed kodem, bez devDependencies. Obraz nie zawiera .env. exec zastępuje powłokę procesem Node, dzięki czemu SIGTERM dociera do aplikacji.</p></div><div>${source('docker-compose.yml')}</div></div>`);
    screen('3.1. Świeży klon: kontenery i automatyczne migracje', 'Repozytorium sklonowano do .review-clone, skopiowano .env.example i wykonano docker compose up --build (tryb detached + wait służył automatycznej kontroli). Powstały osobna sieć i wolumen; API wystartowało po zdrowej bazie. Seed ADMIN-a uruchomiono w działającym kontenerze. Dane wcześniejszej instalacji zachowano.', '03-compose-and-migrations');
    screen('3.2. Graceful shutdown', 'SIGTERM: server.close(), oczekiwanie na listenery, zamknięcie puli PostgreSQL. Zatrzymanie API zajęło około 0,46 s; nie nastąpiło 10-sekundowe oczekiwanie na SIGKILL. Późniejsze docker compose down usunęło kontenery i sieć, zachowując wolumen.', '05-graceful-shutdown');
    screen('3.3. Swagger UI z kontenera', 'Rzeczywisty adres http://localhost:3000/api/docs/. Świeży klon uruchomiono zgodnie z README. Swagger zawiera również chroniony endpoint audit logu.', '06-swagger-container');
    page('4. Event bus i publikacja po COMMIT', `<div class="columns"><div>${source('src/events/eventBus.js')}<p>Każdy listener ma osobny Promise i catch. Awaria jednego nie przerywa publikującej operacji ani pozostałych listenerów. drain() pozwala spokojnie zamknąć proces.</p></div><div><h3>Service rezerwacji</h3>
        ${pre(`const created = await runInTransaction(async repositories => {
    // blokada sali, walidacja, reguły i zapis
    return repositories.reservationsRepository.create(data);
});
eventBus.publish('reservation.created', {
    reservationId: created.id, roomId: created.roomId,
    userId: created.userId,
    startTime: created.startTime, endTime: created.endTime
});
// Anulowanie również w transakcji i pod blokadą sali.
// Powtórne anulowanie: changed=false, bez eventu.
if (result.changed) eventBus.publish('reservation.cancelled', {
    reservationId: reservation.id, roomId: reservation.roomId,
    userId: reservation.userId, cancelledBy: currentUser.id
});`)}<p>Fragment skrócony; pełna implementacja: src/modules/reservations/reservations.service.js. await transakcji kończy się po COMMIT. Odrzucona transakcja przerywa funkcję przed publish. Testy ze szpiegiem jest.fn() potwierdzają sukces, brak publikacji przed zatwierdzeniem i brak eventu po błędzie.</p></div></div>`);
    page('4.1. Audit log i powiadomienie', `<div class="columns"><div>${source('src/db/migrations/005_audit_log.js')}${source('src/events/auditListeners.js')}</div><div>${source('src/modules/audit/audit.repository.knex.js')}
        <p>GET /api/admin/audit-log dopuszcza wyłącznie ADMIN-a. Parametry page, limit (1–100) i eventType są walidowane. Wynik jest sortowany od najnowszych, z id jako rozstrzygnięciem identycznych dat. Test potwierdza 403 dla USER-a, filtr, total i limit.</p>
        <p>Ograniczenie: event bus działa w pamięci. Awaria po COMMIT przed listenerem może zgubić event. Rozwiązanie wymagające trwałości powinno użyć transactional outbox.</p></div></div>`);
    screen('4.2. Scenariusz: utworzenie → konflikt → anulowanie → powtórzenie', `Dla rezerwacji ${demo.reservationId} powstały dokładnie dwa wpisy. Odpowiedzi: 201, 409, 200, 200. Drugie anulowanie zachowało cancelledAt i nie utworzyło eventu. Skrypt sprawdził tę sekwencję asercjami.`, '07-audit-scenario');
    screen('4.3. SQL audit_log i odpowiedź endpointu', 'Zapytanie SQL ograniczono do reservationId z poprzedniego scenariusza. GET z eventType=reservation.cancelled i limit=1 pokazuje filtrowanie, najnowszy wpis i meta. Każde ponowne uruchomienie demonstracji tworzy inną rezerwację, dlatego licznik wszystkich anulowań może być większy niż 1.', '08-audit-sql-and-api');
    screen('4.4. Celowo uszkodzony listener: API nadal zwraca 201', 'Test tymczasowo zastępuje właściwy zapis audytu listenerem rzucającym DEMO: audit unavailable. W logu jest błąd listenera oraz POST /api/reservations → 201; test potwierdza zapis rezerwacji, brak wpisu audit i przywraca sprawny listener w finally.', '13-listener-failure-isolated');
    page('5. GitHub Actions i historia zmian', `<div class="columns"><div>${source('.github/workflows/ci.yml')}</div><div>
        <p>Push do main oraz każdy pull request uruchamiają prawdziwe CI: PostgreSQL z healthcheck, Node.js 22 z cache npm, npm ci, npm test i docker build .</p>
        <p>Baza usługi CI jest jednorazowa i działa z lokalnym trust; workflow nie zawiera stałych haseł ani tokenów. Testowy JWT jest jawnie testowy i nie służy wdrożeniu.</p>
        <p>PR #1: ${link(`${repo}/pull/1`)}<br>Czerwone uruchomienie: ${link(red)}<br>Zielone uruchomienie: ${link(green)}</p>
        <p>Commit 6c4e440 celowo wprowadził błędne &lt;=. CI zatrzymało się na npm test. Commit 78d9916 w tym samym PR przywrócił &lt;. CI zakończyło testy i build sukcesem, po czym PR scalono (ea555ce).</p>
        <h3>Historia repozytorium</h3>${pre(execFileSync('git', ['log', '--oneline', '-8'], { encoding: 'utf8' }))}</div></div>`);
    screen('5.1. Czerwone CI w PR #1', `Rzeczywisty wynik Failure po celowym błędzie granicy przedziału. ${link(red, 'Otwórz uruchomienie')}.`, '09-ci-red');
    screen('5.2. Zielone CI w tym samym PR', `Po poprawce wynik Success, włącznie z docker build . ${link(green, 'Otwórz uruchomienie')}.`, '10-ci-green');
    screen('5.3. README i badge CI', 'Publiczne README zawiera badge rzeczywistego workflow oraz instrukcję git clone → kopia .env → docker compose up --build. Konto ADMIN można utworzyć osobnym bezpiecznym seedem.', '11-readme-badge');
    screen('5.4. Scalenie PR', `PR #1 scalono po zielonym CI: ${link(`${repo}/pull/1`)}. Historia zachowuje osobne commity wprowadzenia i naprawienia celowego błędu.`, '12-merged-pr');
    const html = `<!doctype html><html lang="pl"><meta charset="utf-8"><title>ZTPAI — Adrian Bober — zestaw 05</title><style>
        @page{size:A4 landscape;margin:10mm 12mm}*{box-sizing:border-box}body{margin:0;font:11pt/1.35 Arial,sans-serif;color:#182536}
        section{break-after:page;height:186mm;overflow:hidden}section:last-child{break-after:auto}h2{margin:0 0 3mm;font-size:19pt;color:#134e69}h3{font-size:10pt;margin:2mm 0}
        p{margin:2mm 0 3mm}a{color:#145c87;text-decoration:none;overflow-wrap:anywhere}.author{font-size:16pt;margin:5mm 0}
        pre{background:#eef2f5;border-left:2px solid #267594;padding:2mm;margin:1mm 0;font:8pt/1.23 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
        .columns{display:grid;grid-template-columns:1fr 1fr;gap:6mm}.columns p{font-size:10pt}figure{margin:0;height:157mm;text-align:center}img{max-width:100%;max-height:100%;object-fit:contain}
        table{border-collapse:collapse;width:100%;margin:6mm 0}td,th{padding:3mm;border:1px solid #b8c6ce;text-align:left}th{background:#eaf2f6}
        </style>${pages.join('')}</html>`;
    fs.writeFileSync(`${directory}/sprawozdanie.html`, html);
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const tab = await browser.newPage();
        await tab.goto(pathToFileURL(path.resolve(`${directory}/sprawozdanie.html`)).href);
        const overflow = await tab.locator('section').evaluateAll(sections => sections.map((s, i) => ({ page: i + 1, title: s.querySelector('h2').textContent, overflow: s.scrollHeight - s.clientHeight })).filter(s => s.overflow > 2));
        if (overflow.length) throw new Error('Content overflows pages: ' + JSON.stringify(overflow));
        await tab.pdf({ path: 'ZTPAI_Adrian_Bober_5.pdf', preferCSSPageSize: true, printBackground: true,
            displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font:8px Arial;width:100%;text-align:center;color:#666">Adrian Bober — ZTPAI 05 — <span class="pageNumber"></span>/<span class="totalPages"></span></div>' });
        fs.writeFileSync(`${directory}/report-metadata.json`, JSON.stringify({ sha, pages: pages.length, red, green, pr: `${repo}/pull/1` }, null, 2));
        console.log(`PDF ready: ${pages.length} pages, code ${sha}`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
