import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(
    `library, profile and creation previews can play and pause with reduced motion: ${reducedMotion}`,
    { skip: !process.env.PLAYWRIGHT_MODULE, timeout: 30_000 },
    async () => {
      const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
      const server = await createServer({
        server: { port: 0, strictPort: false },
      });
      let browser;
      try {
        await server.listen();
        browser = await chromium.launch({
          executablePath: process.env.CHROME_BIN,
        });
        const page = await browser.newPage({ reducedMotion });
        const errors: string[] = [];
        page.on("pageerror", (error: Error) => errors.push(error.message));
        await page.route("**/presets.json", async (route: any) => {
          await route.fulfill({
            json: [
              {
                version: 1,
                id: "motion-test",
                name: "Motion test",
                description: "",
                brightness: 100,
                bindings: [],
                macros: [],
                keys: Array.from({ length: 87 }, () => ({
                  color: [255, 100, 50],
                  effect: "breathing",
                  speed: 1,
                })),
                frames: [
                  {
                    duration: 10,
                    keys: Array.from({ length: 87 }, (_, i) => i),
                  },
                ],
              },
            ],
          });
        });
        await page.goto(server.resolvedUrls!.local[0]);

        async function changes(read: () => Promise<string>) {
          const before = await read();
          for (let attempt = 0; attempt < 15; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            if ((await read()) !== before) return;
          }
          assert.fail("Preview stayed frozen after Play");
        }
        async function staysStill(read: () => Promise<string>) {
          await new Promise((resolve) => setTimeout(resolve, 150));
          const before = await read();
          await new Promise((resolve) => setTimeout(resolve, 250));
          assert.equal(await read(), before, "Paused preview kept animating");
        }
        const canvas = page.locator(".profile-miniature").first();
        await canvas.waitFor();
        await page.waitForFunction(() => {
          const canvas = document.querySelector("canvas");
          return canvas && canvas.width > 0;
        });
        const canvasState = () =>
          canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
        const libraryPlay = page.getByRole("button", {
          name: /Включить анимацию|Пауза превью/,
        });
        assert.equal(
          await libraryPlay.getAttribute("aria-pressed"),
          String(reducedMotion !== "reduce"),
        );
        if (reducedMotion === "reduce") {
          await staysStill(canvasState);
          await libraryPlay.click();
        }
        await changes(canvasState);
        await libraryPlay.click();
        await staysStill(canvasState);
        await libraryPlay.click();
        await changes(canvasState);

        await page.locator(".profile-preview").first().click();
        const keyState = () =>
          page
            .locator(".editor .key")
            .evaluateAll((keys: HTMLElement[]) =>
              keys.map((key) => key.getAttribute("style")).join("|"),
            );
        const profilePlay = page.getByRole("button", {
          name: /^(Воспроизвести|Пауза)$/,
        });
        if (reducedMotion === "reduce") {
          await staysStill(keyState);
          await profilePlay.click();
        }
        await changes(keyState);
        await profilePlay.click();
        await staysStill(keyState);
        await profilePlay.click();
        await changes(keyState);

        await page
          .getByRole("button", { name: "Создать профиль", exact: true })
          .first()
          .click();
        await page.getByLabel("Анимация конструктора").selectOption("wave");
        const builderPlay = page.getByRole("button", {
          name: "Предпросмотр",
          exact: true,
        });
        assert.equal(
          await builderPlay.getAttribute("aria-pressed"),
          String(reducedMotion !== "reduce"),
        );
        if (reducedMotion === "reduce") {
          await staysStill(keyState);
          await builderPlay.click();
        }
        await changes(keyState);
        await page.getByLabel("Палитра конструктора").selectOption("custom");
        await changes(keyState);
        await builderPlay.click();
        await staysStill(keyState);
        await builderPlay.click();
        await changes(keyState);

        // A new OS request to reduce motion pauses playback, while a later
        // explicit Play remains available without changing Windows settings.
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForFunction(() =>
          document.querySelector(
            '.profile-builder button[aria-pressed="false"]',
          ),
        );
        await staysStill(keyState);
        await builderPlay.click();
        await changes(keyState);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
      }
    },
  );
}
