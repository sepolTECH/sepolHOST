import { app } from './app.js';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { pool } from './db/pool.js';

async function bootstrap() {
  // Aplica migrations pendentes ao subir (seguro rodar sempre)
  await runMigrations();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n${signal} recebido, encerrando...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  console.error('❌ Falha ao iniciar a API:', err);
  process.exit(1);
});
