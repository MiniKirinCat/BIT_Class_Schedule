import { CloudApp } from './cloud/CloudApp';
import { LocalApp } from './local/LocalApp';

const cloudMode = import.meta.env.VITE_APP_MODE === 'cloud';

export function App() {
  return cloudMode ? <CloudApp /> : <LocalApp />;
}
