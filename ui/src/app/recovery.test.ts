import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

test(
  "the editor exposes stored keyboard features without host-only controls",
  {
    skip: !process.env.PLAYWRIGHT_MODULE,
    timeout: 30_000,
  },
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
      const page = await browser.newPage();
      await page.goto(server.resolvedUrls!.local[0]);
      await page.locator(".profile-preview").first().waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Приложения", exact: true })
          .count(),
        0,
      );
      await page.locator(".profile-preview").first().click();
      await page
        .getByRole("button", { name: "Создать копию", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("button", { name: "Предпросмотр", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", {
            name: "Добавить реакцию на нажатия",
            exact: true,
          })
          .count(),
        0,
      );
      assert.ok(
        await page
          .getByRole("button", { name: "Записать профиль в клавиатуру" })
          .isVisible(),
      );
      await page.getByRole("button", { name: "Макросы", exact: true }).click();
      await page
        .getByRole("heading", { name: "Макросы", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Переназначение", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Переназначение", exact: true })
        .waitFor();
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);

test(
  "a render failure offers recovery and reloading opens the editor again",
  {
    skip: !process.env.PLAYWRIGHT_MODULE,
    timeout: 30_000,
  },
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
      const page = await browser.newPage();
      const failures: string[] = [];
      page.on("pageerror", (error: Error) => failures.push(error.message));
      let damaged = true;
      await page.route("**/presets.json", async (route: any) => {
        if (!damaged) return route.continue();
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify([
            {
              version: 1,
              id: "damaged",
              name: "Damaged",
              description: "",
              brightness: 100,
              keys: [],
              frames: null,
              bindings: [],
            },
          ]),
        });
      });
      await page.goto(server.resolvedUrls!.local[0]);
      const recovery = page
        .getByRole("alert")
        .filter({
          has: page.getByRole("button", { name: "Перезагрузить редактор" }),
        });
      try {
        await recovery.waitFor({ timeout: 10_000 });
      } catch (error) {
        assert.fail(
          `Recovery was unavailable: ${failures.join("; ")}\n${await page.locator("#root").innerText()}\n${error}`,
        );
      }
      assert.match(await recovery.innerText(), /несохранённые изменения/i);
      damaged = false;
      await recovery.getByRole("button").click();
      await page
        .getByRole("heading", { name: "Подсветка", exact: true })
        .waitFor();
      await page.locator(".profile-preview").first().waitFor();
      assert.ok((await page.locator(".profile-preview").count()) > 0);
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);
