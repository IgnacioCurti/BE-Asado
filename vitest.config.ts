import { defineConfig } from "vitest/config";

// Valores fijos para que los tests nunca lean secretos ni la base de datos de .env.
// dotenv no pisa variables ya definidas, así que estas tienen prioridad.
const testEnv = {
  NODE_ENV: "test",
  TZ: "UTC",
  JWTPRIVATEKEY: "test-jwt-private-key",
  BREVO_API_KEY: "test-brevo-api-key",
  BREVO_URL: "https://brevo.test/v3/smtp/email",
  ADMIN_MAIL: "admin@endava.com",
  // DATABASE_URL lo define tests/setup/integration.ts apuntando a mongodb-memory-server.
  DATABASE_URL: "mongodb://127.0.0.1:1/never-used",
};

export default defineConfig({
  test: {
    env: testEnv,
    pool: "forks",
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/setup/mongoGlobalSetup.ts"],
          setupFiles: ["tests/setup/integration.ts"],
          testTimeout: 30000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
