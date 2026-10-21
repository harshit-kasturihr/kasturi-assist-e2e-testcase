import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TESTS_ROOT_PATH = __dirname;
export const STATE_DIR_PATH = `${TESTS_ROOT_PATH}/.state/`;
// Canonical location (new structure). fixtures/test-fixtures.ts falls
// back to this legacy path for back-compat with existing runs.
export const ADMIN_AUTH_STATE_PATH = `${TESTS_ROOT_PATH}/auth/admin.json`;
export const LEGACY_ADMIN_AUTH_STATE_PATH = `${STATE_DIR_PATH}/admin-auth.json`;

export default defineConfig({
    testDir: "./tests",

    timeout: 60 * 1000,

    expect: { timeout: 20 * 1000 },

    outputDir: "./test-results",

    fullyParallel: false,

    workers: 1,

    forbidOnly: !!process.env.CI,

    retries: 0,

    reportSlowTests: null,

    reporter: [
        ["list"],
        [
            "allure-playwright",
            {
                resultsDir:
                    process.env.ALLURE_RESULTS_DIR ||
                    "./allure-results",
            },
        ],
    ],

    use: {
        baseURL: `${env.appUrl}/`.replace(/\/+$/, "/"),
        screenshot: {
            mode: "only-on-failure",
            fullPage: true,
        },
        video:
          // Evidence rule: PASS needs video too. Run evidence runs with
          // E2E_VIDEO=on (videos kept for every test); default stays
          // retain-on-failure so routine runs stay light.
          process.env.E2E_VIDEO === 'on' ? 'on' : 'retain-on-failure',
        trace: "retain-on-failure",
    },

    projects: [
        {
            name: "chromium",
            use: {
                ...devices["Desktop Chrome"],
            },
        },

        // {
        //     name: "mobile-chrome",
        //     use: {
        //         ...devices["Pixel 5"],
        //         viewport: {
        //             width: 375,
        //             height: 812,
        //         },
        //     },
        // },
    ],
});