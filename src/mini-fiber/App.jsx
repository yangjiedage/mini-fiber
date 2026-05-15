/** @jsx MiniFiber.createElement */
/* @jsxRuntime classic */
import * as MiniFiber from './reconciler.js';
import { useState, useEffect, useRef, useLayoutEffect } from './hooks.js';
import { scheduleCallback, UserBlockingPriority, LowPriority } from './scheduler.js';
import LetterItem from './LetterItem.jsx';
import './app.css'
import styles from './app.module.css'

function App() {
    const [count, setCount] = useState(1);
    const [showList, setShowList] = useState(false);
    const [letterList, setLetterList] = useState(['a', 'b', 'c', 'd']);
    const listRef = useRef(null);
    const [letter, setLetter] = useState('aaaa');

    useEffect(() => {
        console.log('useEffect: count changed to', count);
        return () => console.log('useEffect cleanup for count', count);
    }, [count]);

    useLayoutEffect(() => {
        if (listRef.current) {
            listRef.current.style.border = '2px solid red';
            console.log('useLayoutEffect: border applied');
        }
    }, [showList]);

    const handleHeavyTask = () => {
        console.log('handleHeavyTask: Scheduling low priority update (+1)...');
        scheduleCallback(LowPriority, () => {
            setShowList(true);
            setCount(c => c + 10);
        });
    };

    const handleIncrement = () => {
        console.log('handleIncrement: Scheduling high priority update (*2)...');
        scheduleCallback(UserBlockingPriority, () => {
            setCount(c => c * 2);
        });
    };

    return (
        <div className="container" style={{ padding: '20px', fontFamily: 'sans-serif' }}>
            <h1>Mini-Fiber Demo</h1>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
                <h3>Interactive State (High Priority)</h3>
                <p>Count: {count}</p>
                <button onClick={handleIncrement} style={{ padding: '10px 20px', cursor: pointer }}>
                    Increment (High Priority)
                </button>
            </div>

            <div style={{ marginBottom: '20px', padding: '15px', background: '#e0f7fa', borderRadius: '8px' }}>
                <h3>Interruptible Rendering (Low Priority)</h3>
                <button onClick={handleHeavyTask} style={{ padding: '10px 20px', cursor: pointer }}>
                    Render Heavy List (Low Priority)
                </button>

                {showList && (
                    <div ref={listRef} style={{ marginTop: '15px', maxHeight: '200px', overflow: 'auto' }}>
                        <h4>Heavy List (100000 Items)</h4>
                        {Array.from({ length: 100000 }).map((_, i) => (
                            <div key={i} style={{ padding: '2px', borderBottom: '1px solid #ccc' }}>
                                Item {i} - Rendering this is interruptible!
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* <div>
                {letterList.map(item => <LetterItem key={item} letter={item} />)}
            </div> */}
            <button onClick={() => {
                setLetter(`${Math.random().toFixed(2)}`)
            }} className="btn">
                change letter
            </button>
            <LetterItem letter={letter} />
            <button onClick={() => {
                setLetterList(['b', 'c', 'd', 'a'])
            }}>change letter list</button>
            <div style={{ fontSize: '0.9em', color: '#666' }}>
                <p>Check the console to see the Work Loop and Hook logs.</p>
            </div>
            <div style={styles['text-tips']}>
                hhhhhh
            </div>
        </div>
    );
}

const pointer = 'pointer';

export default App;
