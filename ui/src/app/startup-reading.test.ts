import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "vite";

for (const failure of ["delayed", "crashed"] as const) {
  test(
    `startup stays usable and closable when USB reading is ${failure}`,
    {
      skip: !process.env.PLAYWRIGHT_MODULE,
      timeout: 20_000,
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
        const errors: string[] = [];
        page.on("pageerror", (error: Error) => errors.push(error.message));
        await page.addInitScript(
          ({ failure }: { failure: string }) => {
            const host = window as any;
            const callbacks = new Map<number, Function>();
            let next = 0;
            const device = {
              connected: true,
              supported: true,
              revision: "3131",
              identity: "usb-test",
              active: 1,
              message: "Connected",
            };
            host.isTauri = true;
            host.testIPC = { scanCount: 0, saves: 0, destroyed: false };
            host.__TAURI_INTERNALS__ = {
              metadata: {
                currentWindow: { label: "main" },
                currentWebview: { label: "main" },
              },
              transformCallback(callback: Function) {
                callbacks.set(++next, callback);
                return next;
              },
              async invoke(command: string, args: any) {
                if (command === "bootstrap")
                  return {
                    profiles: [],
                    templates: [
                      {
                        version: 1,
                        id: "fixture",
                        name: "Startup test",
                        description: "",
                        brightness: 100,
                        keys: Array.from({ length: 87 }, () => ({
                          color: [0, 255, 100],
                          effect: "static",
                          speed: 1,
                          pause: 32,
                        })),
                        frames: [
                          {
                            keys: Array.from({ length: 87 }, (_, i) => i),
                            duration: 1,
                          },
                        ],
                        bindings: [],
                      },
                    ],
                  };
                if (command === "probe_device") return device;
                if (command === "scan_hardware") {
                  host.testIPC.scanCount++;
                  if (failure === "crashed")
                    throw new Error("USB reader crashed");
                  return new Promise(() => {});
                }
                if (command === "save_library") {
                  host.testIPC.saves++;
                  return;
                }
                if (command === "plugin:event|listen") {
                  if (args.event === "tauri://close-requested")
                    host.testIPC.close = () =>
                      callbacks.get(args.handler)!({
                        event: args.event,
                        id: 1,
                        payload: null,
                      });
                  return 1;
                }
                if (command === "plugin:window|destroy") {
                  host.testIPC.destroyed = true;
                  return;
                }
                if (command === "plugin:event|unlisten") return;
                throw new Error(`Unexpected command: ${command}`);
              },
            };
          },
          { failure },
        );
        await page.goto(server.resolvedUrls!.local[0]);
        await page.waitForFunction(
          () => (window as any).testIPC.scanCount === 1,
        );
        if (failure === "crashed") {
          await page
            .getByRole("alert")
            .filter({ hasText: "USB reader crashed" })
            .waitFor();
          await new Promise((resolve) => setTimeout(resolve, 2200));
          assert.equal(
            await page.evaluate(() => (window as any).testIPC.scanCount),
            1,
          );
        } else {
          await page
            .getByRole("status")
            .filter({ hasText: "Чтение профилей клавиатуры" })
            .waitFor();
        }
        await page.locator(".profile-preview").first().click();
        await page
          .getByRole("button", { name: "Создать профиль", exact: true })
          .first()
          .click();
        await page
          .getByLabel("Название создаваемого профиля")
          .fill("Works during USB scan");
        await page
          .getByRole("button", {
            name: "Создать и открыть профиль",
            exact: true,
          })
          .click();
        await page.waitForFunction(() => (window as any).testIPC.saves > 0);
        await page.evaluate(() => (window as any).testIPC.close());
        await page.waitForFunction(() => (window as any).testIPC.destroyed);
        assert.deepEqual(errors, []);
      } finally {
        await browser?.close();
        await server.close();
      }
    },
  );
}
