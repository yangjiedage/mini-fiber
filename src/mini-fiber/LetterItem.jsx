/** @jsx MiniFiber.createElement */
/* @jsxRuntime classic */
import * as MiniFiber from './reconciler.js';
import { useState } from './hooks.js';

const LetterItem = ({ letter }) => {
    const [count, setCount] = useState(0);
    return <div> 
        <p>- {letter} - {count}</p>
        <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>;
};

export default MiniFiber.fakeMemo(LetterItem);