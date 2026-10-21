import type { Page } from "@playwright/test";
import { LoginPage } from "../pages/LoginPage";
import { getAdminUser } from "./testData";

/**
 * @deprecated Use `new LoginPage(page).loginAsAdmin()` or the
 * `adminPage` fixture from `fixtures/test-fixtures.ts` instead.
 */
export async function loginAsAdmin(page: Page) {
    const admin = getAdminUser();
    await new LoginPage(page).login(admin.username, admin.password);
    return admin;
}