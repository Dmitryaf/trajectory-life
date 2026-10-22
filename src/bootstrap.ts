import { startApplication } from './features/app-shell/startup';
import './features/app-shell/startup.css';

void startApplication(async () => {
  const { mountApplication } = await import('./main');
  await mountApplication();
});
