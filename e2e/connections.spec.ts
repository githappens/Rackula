import { test, expect } from "./helpers/base-test";
import { gotoWithRack, dragDeviceToRack, locators } from "./helpers";

test.describe("Connections", () => {
  test("clicking two ports creates a visible cable", async ({ page }) => {
    await gotoWithRack(page);

    // Place both AV devices at distinct rows so they do not collide.
    await dragDeviceToRack(page, {
      deviceName: "Mic Preamp (2ch)",
      yOffsetPercent: 20,
    });
    await dragDeviceToRack(page, {
      deviceName: "Compressor (2ch)",
      yOffsetPercent: 50,
    });

    // Arm the source port (an output), then click a target port (an input).
    await page.locator('[data-port-name="Line Out 1"]').first().click();
    await page.locator('[data-port-name="In 1"]').first().click();

    await expect(page.locator(locators.connection.path).first()).toBeVisible();
  });
});
