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

  test("Connections panel lists the connection and filters it out", async ({
    page,
  }) => {
    await gotoWithRack(page);

    await dragDeviceToRack(page, {
      deviceName: "Mic Preamp (2ch)",
      yOffsetPercent: 20,
    });
    await dragDeviceToRack(page, {
      deviceName: "Compressor (2ch)",
      yOffsetPercent: 50,
    });

    await page.locator('[data-port-name="Line Out 1"]').first().click();
    await page.locator('[data-port-name="In 1"]').first().click();
    await expect(page.locator(locators.connection.path).first()).toBeVisible();

    // Open the Connections tab and confirm the connection is listed.
    await page.locator(locators.connection.tab).click();
    await expect(page.locator(locators.connection.panel)).toBeVisible();
    const rows = page.locator(locators.connection.row);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Mic Preamp");

    // A search that matches nothing shows the empty state.
    await page.locator(locators.connection.search).fill("zzzzznomatch");
    await expect(page.locator(locators.connection.empty)).toBeVisible();
    await expect(page.locator(locators.connection.empty)).toContainText(
      "No connections match the filters",
    );
  });
});
