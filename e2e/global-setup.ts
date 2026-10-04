import { createServer } from 'vite';
import { writeDemoFile } from '../scripts/generate-test-user-data.mjs';
import { visualDemoAnchor, visualDemoFilePath } from './demo-data';

export default async function globalSetup() {
  await Promise.all([writeDemoFile(), writeDemoFile({ anchor: visualDemoAnchor, output: visualDemoFilePath })]);
  process.env.VITE_FEEDBACK_ENABLED ||= 'true';
  process.env.VITE_PRODUCT_TELEMETRY_ENABLED ||= 'true';
  const server = await createServer({
    logLevel: 'error',
    server: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: true,
    },
  });
  await server.listen();

  return async () => {
    await server.close();
  };
}
