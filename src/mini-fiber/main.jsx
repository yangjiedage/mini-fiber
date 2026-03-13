import * as MiniFiber from './reconciler.js';
import App from './App.jsx';

const container = document.getElementById('root');
MiniFiber.render(<App />, container);
