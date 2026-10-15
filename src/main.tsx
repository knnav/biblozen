import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initPlatform } from './platform';
import { applyCachedTheme } from './themes/engine';
import './themes/reading/fonts';
import './styles/tokens.css';
import './styles/print.css';
import './styles/base.css';

async function boot() {
  applyCachedTheme();
  const platform = await initPlatform();
  if (platform.kind === 'tauri') {
    const { maybeRunSmoke } = await import('./smoke');
    if (await maybeRunSmoke(platform)) return;
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
