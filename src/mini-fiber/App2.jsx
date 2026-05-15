/** @jsx MiniFiber.createElement */
/* @jsxRuntime classic */
import * as MiniFiber from './reconciler.js';
import { useState } from './hooks.js';
import { scheduleCallback, UserBlockingPriority } from './scheduler.js';
import LetterItem from './LetterItem.jsx';
import './app.css'

function App() {
    const [count, setCount] = useState(1);

    const handleIncrement = () => {
        scheduleCallback(UserBlockingPriority, () => {
            setCount(c => c * 2);
        });
    };

    return (
        <div className="container" style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <p>Count: {count}</p>
            <button onClick={handleIncrement} style={{ padding: '10px 20px', cursor: pointer }}>
                Increment (High Priority)
            </button>
            <LetterItem letter="a" />
        </div>
    );
}

const pointer = 'pointer';

export default App;
