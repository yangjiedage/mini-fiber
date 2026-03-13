import { getWipFiber, getHookIndex, setHookIndex, scheduleUpdate } from './reconciler.js';
import { getCurrentPriorityLevel, NormalPriority } from './scheduler.js';

export function useState(initial) {
    const wipFiber = getWipFiber();
    const index = getHookIndex();
    const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[index];

    const hook = {
        memoizedState: oldHook ? oldHook.memoizedState : initial,
        baseState: oldHook ? oldHook.baseState : initial,
        baseQueue: oldHook ? oldHook.baseQueue : [],
        queue: [], // incoming updates
    };

    // Merge pending updates from the alternate if they wasn't processed
    if (oldHook && oldHook.queue && oldHook.queue.length > 0) {
        hook.baseQueue = [...hook.baseQueue, ...oldHook.queue];
    }

    const renderLane = getCurrentPriorityLevel();

    // Re-basing logic: process the queue and maintain dispatch order
    if (hook.baseQueue.length > 0) {
        let newState = hook.baseState;
        let newBaseState = newState;
        let newBaseQueue = [];
        let firstSkipped = null;

        hook.baseQueue.forEach(update => {
            if (update.lane <= renderLane) {
                // Sufficient priority: apply but keep in baseQueue if we already skipped something
                newState = typeof update.action === 'function'
                    ? update.action(newState)
                    : update.action;

                if (firstSkipped === null) {
                    newBaseState = newState;
                } else {
                    newBaseQueue.push({ ...update });
                }
            } else {
                // Insufficient priority: skip and mark
                if (firstSkipped === null) {
                    firstSkipped = update;
                    newBaseState = newState; // State before the first skip
                }
                newBaseQueue.push({ ...update });
            }
        });

        hook.memoizedState = newState;
        hook.baseState = newBaseState;
        hook.baseQueue = newBaseQueue;
    }

    const setState = action => {
        const lane = getCurrentPriorityLevel();
        hook.queue.push({ action, lane });

        const currentRoot = findRoot(wipFiber);
        const container = currentRoot.stateNode;
        const latestCommited = container._rootFiber || currentRoot;

        scheduleUpdate({
            stateNode: container,
            props: latestCommited.props,
            alternate: latestCommited,
            deletions: [],
        });
    };

    wipFiber.hooks.push(hook);
    setHookIndex(index + 1);
    return [hook.memoizedState, setState];
}

export function useRef(initial) {
    const wipFiber = getWipFiber();
    const index = getHookIndex();
    const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[index];

    const hook = {
        current: oldHook ? oldHook.current : initial,
    };

    wipFiber.hooks.push(hook);
    setHookIndex(index + 1);
    return hook;
}

export function useEffect(callback, deps) {
    const wipFiber = getWipFiber();
    const index = getHookIndex();
    const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[index];

    const hasChanged = !oldHook || !deps || deps.some((dep, i) => dep !== oldHook.deps[i]);

    const hook = {
        tag: 'passive',
        callback,
        deps,
        cleanup: oldHook ? oldHook.cleanup : null,
    };

    if (hasChanged) {
        setTimeout(() => {
            if (hook.cleanup) hook.cleanup();
            hook.cleanup = callback();
        }, 0);
    }

    wipFiber.hooks.push(hook);
    setHookIndex(index + 1);
}

export function useLayoutEffect(callback, deps) {
    const wipFiber = getWipFiber();
    const index = getHookIndex();
    const oldHook = wipFiber.alternate && wipFiber.alternate.hooks && wipFiber.alternate.hooks[index];

    const hasChanged = !oldHook || !deps || deps.some((dep, i) => dep !== oldHook.deps[i]);

    const hook = {
        tag: 'layout',
        callback,
        deps,
        cleanup: oldHook ? oldHook.cleanup : null,
    };

    if (hasChanged) {
        hook.handler = () => {
            if (hook.cleanup) hook.cleanup();
            hook.cleanup = callback();
        };
        wipFiber.effectTag |= 0b100000; // Layout tag
    }

    wipFiber.hooks.push(hook);
    setHookIndex(index + 1);
}

function findRoot(fiber) {
    let node = fiber;
    while (node.return) {
        node = node.return;
    }
    return node;
}
