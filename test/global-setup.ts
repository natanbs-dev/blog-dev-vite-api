import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import { runMigrations } from '../src/db/migrate.ts';

let container: StartedPostgreSqlContainer;

export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  project.provide('dbUrl', url);
  return async () => {
    await container.stop();
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string;
  }
}
