import React, { useCallback, useState, startTransition, Profiler } from 'react'
import './App.css'

const onListRenderCallback = (
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
  commitTime,
) => {
  console.log(`[Profiler] ${id} (${phase})`);
  console.log(`  实际渲染耗时: ${actualDuration.toFixed(2)}ms`);
  console.log(`  估算完整渲染耗时: ${baseDuration.toFixed(2)}ms`);
  console.log(`  渲染开始时间: ${startTime.toFixed(2)}ms`);
  console.log(`  提交时间: ${commitTime.toFixed(2)}ms`);
};

const ListComponent = (props) => {
  if (!props.showList) {
    return null;
  }
  return (
     <div style={{ marginTop: '15px', maxHeight: '200px', overflow: 'auto' }}>
        <h4>Heavy List (100000 Items)</h4>
        {Array.from({ length: 300000 }).map((_, i) => (
            <div key={i} style={{ padding: '2px', borderBottom: '1px solid #ccc' }}>
                Item {i} - Rendering this is interruptible!
            </div>
        ))}
    </div>
  )
}
const MemoizedListComponent = React.memo(ListComponent);

function App() {
  const [count, setCount] = useState(1);
  const [showList, setShowList] = useState(false);

  const handleHeavyTask = useCallback(() => {
    startTransition(() => {
      setShowList((current) => !current);
    });
  }, []);

  const handleIncrement = useCallback(() => {
    setCount(c => c * 2);
  }, []);

  return (
    <div className="App">
     <h1>Mini-Fiber Demo</h1>
      <div style={{ marginBottom: '20px', padding: '15px', background: '#f0f0f0', borderRadius: '8px' }}>
          <h3>Interactive State (High Priority)</h3>
          <p>Count: {count}</p>
          <button onClick={handleIncrement} style={{ padding: '10px 20px', cursor: 'pointer' }}>
              Increment (High Priority)
          </button>
      </div>

      <div style={{ marginBottom: '20px', padding: '15px', background: '#e0f7fa', borderRadius: '8px' }}>
          <h3>Interruptible Rendering (Low Priority)</h3>
          <button onClick={handleHeavyTask} style={{ padding: '10px 20px', cursor: 'pointer' }}>
              Render Heavy List (Low Priority)
          </button>

          <Profiler id="ListComponent" onRender={onListRenderCallback}>
            <MemoizedListComponent showList={showList} />
          </Profiler>
      </div>
    </div>
  )
}

export default App
