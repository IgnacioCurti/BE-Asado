import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}

// Una sola instancia de Mongo en memoria para toda la corrida;
// cada archivo de test usa su propia base de datos (ver tests/setup/integration.ts).
export default async function setup(project: TestProject) {
  const server: MongoMemoryServer = await MongoMemoryServer.create({
    binary: { version: "7.0.14" },
  });
  project.provide("mongoUri", server.getUri());
  return async () => {
    await server.stop();
  };
}
