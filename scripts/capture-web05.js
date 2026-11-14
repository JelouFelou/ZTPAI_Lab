const { chromium } = require('../.tools/node_modules/playwright-core');
async function main() {
    const [url, name] = process.argv.slice(2);
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 1 });
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        if (url.includes('/api/docs')) await page.locator('.opblock').first().waitFor();
        if (name.includes('readme')) {
            await page.getByRole('heading', { name: 'Room Booking API — zadanie 05', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
            await page.waitForTimeout(1200);
        }
        await page.screenshot({ path: `screenshots/zad5/${name}.png`, fullPage: false });
        console.log(await page.title());
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
