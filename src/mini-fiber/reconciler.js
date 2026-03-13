import { scheduleCallback, shouldYield, NormalPriority, UserBlockingPriority, getCurrentPriorityLevel } from './scheduler.js';

// Effect Tags
export const Placement = 0b10;
export const Update = 0b100;
export const Deletion = 0b1000;
export const Passive = 0b10000;
export const Layout = 0b100000;

let workInProgress = null;
let pendingCommit = null;
let wipFiber = null;
let hookIndex = null;
let currentRootFiber = null;

export function createElement(type, props, ...children) {
    return {
        type,
        props: {
            ...props,
            children: children.flat().map(child =>
                (child === null || child === false || child === undefined || typeof child === 'object')
                    ? child
                    : createTextElement(child)
            ),
        },
    };
}

function createTextElement(text) {
    return {
        type: 'TEXT_ELEMENT',
        props: {
            nodeValue: text,
            children: [],
        },
    };
}

export function render(element, container) {
    const rootFiber = {
        stateNode: container,
        props: {
            children: [element],
        },
        alternate: container._rootFiber || null,
        deletions: [], // Pass-local deletions
    };
    scheduleUpdate(rootFiber);
}

function scheduleUpdate(fiber) {
    currentRootFiber = fiber;
    const priority = getCurrentPriorityLevel();

    // Coalesced scheduling: the callback itself will fetch the LATEST rootfiber
    // from the container if needed to avoid stale alternates.
    scheduleCallback(priority, (didTimeout) => {
        // Find the LATEST version of this root if we're starting a new pass
        const container = fiber.stateNode;
        const latestCommited = container._rootFiber;

        // If we are starting from scratch (or resuming a preempted task),
        // we should ideally use the latest committed state as the alternate.
        if (!workInProgress || workInProgress.isFinished) {
            fiber.alternate = latestCommited || null;
            fiber.deletions = []; // Reset deletions for a fresh pass
        }

        return workLoop(didTimeout, fiber);
    });
}

function workLoop(didTimeout, taskRoot) {
    const currentLane = getCurrentPriorityLevel();

    console.log('work loop', currentLane, workInProgress)
    // Preemption check: if current task is higher priority than ongoing work
    if (!workInProgress || (workInProgress.lane && currentLane < workInProgress.lane)) {
        workInProgress = taskRoot;
        workInProgress.lane = currentLane;
        // Optimization: Ensure we are diffing against the ABSOLUTE LATEST committed tree
        const latestCommited = taskRoot.stateNode._rootFiber;
        if (latestCommited && latestCommited !== taskRoot.alternate) {
            taskRoot.alternate = latestCommited;
        }
    }

    while (workInProgress && (didTimeout || !shouldYield())) {
        const next = performUnitOfWork(workInProgress, taskRoot);
        if (next) next.lane = workInProgress.lane;
        workInProgress = next;
    }

    if (!workInProgress && taskRoot.pendingCommit) {
        console.log('Committing root...');
        const finishedRoot = taskRoot.pendingCommit;
        commitRoot(taskRoot);
        finishedRoot.isFinished = true;
        taskRoot.pendingCommit = null;
        return null;
    }

    return workInProgress ? (didTimeout) => workLoop(didTimeout, taskRoot) : null;
}

function performUnitOfWork(fiber, root) {
    const isFunctionComponent = typeof fiber.type === 'function';
    if (isFunctionComponent) {
        updateFunctionComponent(fiber, root);
    } else {
        updateHostComponent(fiber, root);
    }

    if (fiber.child) return fiber.child;
    let nextFiber = fiber;
    while (nextFiber) {
        completeWork(nextFiber, root);
        if (nextFiber.sibling) return nextFiber.sibling;
        nextFiber = nextFiber.return;
    }
    return null;
}

function completeWork(fiber, root) {
    if (fiber.return) {
        const returnFiber = fiber.return;
        if (!returnFiber.firstEffect) returnFiber.firstEffect = fiber.firstEffect;
        if (fiber.lastEffect) {
            if (returnFiber.lastEffect) returnFiber.lastEffect.nextEffect = fiber.firstEffect;
            returnFiber.lastEffect = fiber.lastEffect;
        }
        if (fiber.effectTag) {
            if (returnFiber.lastEffect) returnFiber.lastEffect.nextEffect = fiber;
            else returnFiber.firstEffect = fiber;
            returnFiber.lastEffect = fiber;
        }
    } else {
        root.pendingCommit = fiber;
    }
}

function updateFunctionComponent(fiber, root) {
    wipFiber = fiber;
    hookIndex = 0;
    wipFiber.hooks = [];
    const result = fiber.type(fiber.props);
    const elements = Array.isArray(result) ? result : [result];
    reconcileChildren(fiber, elements.flat(), root);
}

function updateHostComponent(fiber, root) {
    if (!fiber.stateNode) {
        fiber.stateNode = fiber.type === 'TEXT_ELEMENT'
            ? document.createTextNode('')
            : document.createElement(fiber.type);
        updateDom(fiber.stateNode, {}, fiber.props);
    }
    reconcileChildren(fiber, fiber.props.children, root);
}

function reconcileChildren(wipFiber, elements, root) {
    let index = 0;
    let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
    let prevSibling = null;

    while (index < elements.length || oldFiber != null) {
        const element = elements[index];
        let newFiber = null;

        const isFalsy = element === null || element === false || element === undefined;
        const sameType = oldFiber && !isFalsy && element.type === oldFiber.type;

        if (sameType) {
            newFiber = {
                type: oldFiber.type,
                props: element.props,
                stateNode: oldFiber.stateNode,
                return: wipFiber,
                alternate: oldFiber,
                effectTag: Update,
            };
        } else if (!isFalsy && element) {
            newFiber = {
                type: element.type,
                props: element.props,
                stateNode: null,
                return: wipFiber,
                alternate: null,
                effectTag: Placement,
            };
        }

        if (oldFiber && !sameType) {
            oldFiber.effectTag = Deletion;
            root.deletions.push(oldFiber);
        }

        if (oldFiber) oldFiber = oldFiber.sibling;

        if (index === 0) {
            wipFiber.child = newFiber;
        } else if (prevSibling) {
            prevSibling.sibling = newFiber;
        }

        if (newFiber) {
            prevSibling = newFiber;
        }
        index++;
    }
}

function commitRoot(root) {
    root.deletions.forEach(commitWork);
    let effect = root.pendingCommit.firstEffect;
    while (effect) {
        commitWork(effect);
        effect = effect.nextEffect;
    }
    root.stateNode._rootFiber = root.pendingCommit;
}

function commitWork(fiber) {
    if (!fiber) return;

    let domParentFiber = fiber.return;
    while (domParentFiber && !domParentFiber.stateNode) domParentFiber = domParentFiber.return;
    const domParent = domParentFiber ? domParentFiber.stateNode : null;

    if (fiber.effectTag === Placement && fiber.stateNode != null && domParent) {
        domParent.appendChild(fiber.stateNode);
    } else if (fiber.effectTag === Update && fiber.stateNode != null) {
        updateDom(fiber.stateNode, fiber.alternate.props, fiber.props);
    } else if (fiber.effectTag === Deletion && domParent) {
        commitDeletion(fiber, domParent);
    }

    if (fiber.props && fiber.props.ref) fiber.props.ref.current = fiber.stateNode;
    if (fiber.effectTag & Layout) {
        fiber.hooks?.forEach(h => h.tag === 'layout' && h.handler && h.handler());
    }
}

function commitDeletion(fiber, domParent) {
    if (fiber.stateNode) domParent.removeChild(fiber.stateNode);
    else commitDeletion(fiber.child, domParent);
}

const isEvent = k => k.startsWith('on');
const isProperty = k => k !== 'children' && k !== 'ref' && !isEvent(k);
const isNew = (p, n) => k => p[k] !== n[k];
const isGone = (p, n) => k => !(k in n);

function updateDom(dom, prev, next) {
    Object.keys(prev).filter(isEvent).filter(k => !(k in next) || isNew(prev, next)(k)).forEach(n => {
        dom.removeEventListener(n.toLowerCase().substring(2), prev[n]);
    });
    Object.keys(prev).filter(isProperty).filter(isGone(prev, next)).forEach(n => {
        if (n === 'style' && typeof prev[n] === 'object') {
            Object.keys(prev[n]).forEach(s => dom.style[s] = '');
        } else {
            dom[n] = '';
        }
    });
    Object.keys(next).filter(isProperty).filter(isNew(prev, next)).forEach(n => {
        if (n === 'style' && typeof next[n] === 'object') {
            Object.assign(dom.style, next[n]);
        } else {
            dom[n] = next[n];
        }
    });
    Object.keys(next).filter(isEvent).filter(isNew(prev, next)).forEach(n => {
        dom.addEventListener(n.toLowerCase().substring(2), next[n]);
    });
}

export { scheduleUpdate };
export function getWipFiber() { return wipFiber; }
export function getHookIndex() { return hookIndex; }
export function setHookIndex(v) { hookIndex = v; }
export function getCurrentRootFiber() { return currentRootFiber; }
