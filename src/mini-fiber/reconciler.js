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

function shallowCompare(next, prev) {
    if (prev === next) return true;
    if (typeof prev !== 'object' || typeof next !== 'object') return false;
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (prevKeys.length !== nextKeys.length) return false;
    for (let i = 0; i < prevKeys.length; i++) {
        if (prevKeys[i] === 'children') continue;
        if (prev[prevKeys[i]] !== next[prevKeys[i]]) return false;
    }
    return true;
}

export function fakeMemo(component) {
    return (next, prev) => {
        if (!prev) return component(next)
        if (shallowCompare(next, prev)) return null;
        return component(next);
    };
}

export function createElement(type, props, ...children) {
    const key = props && props.key ? props.key : null;
    return {
        type,
        key,
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
    const result = fiber.type(fiber.props, fiber.alternate?.props);

    // Bailout for memo: if result is exactly null (returned by fakeMemo)
    // and we have an alternate, we just clone the old children instead of re-rendering.
    if (result === null && fiber.alternate) {
        let child = fiber.alternate.child;
        let prevSibling = null;
        while (child) {
            const newFiber = {
                type: child.type,
                key: child.key,
                props: child.props,
                stateNode: child.stateNode,
                return: fiber, // point to current fiber (the bailed out one)
                alternate: child,
                effectTag: Update,
                index: child.index,
            };
            if (!prevSibling) {
                fiber.child = newFiber;
            } else {
                prevSibling.sibling = newFiber;
            }
            prevSibling = newFiber;

            // To ensure the entire sub-tree is kept, we also need to copy
            // refs to the children of this duplicated fiber, but for simplicity
            // in a naive reconciler, we let the work loop descend into them 
            // and they will be reconciled against their alternates without changes.
            child = child.sibling;
        }
        return;
    }

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
    let lastPlacedIndex = 0;

    // 1. First Pass: Sequential matching (Same key and type)
    // This handles the common case where items are just appended or updated in order.
    while (oldFiber && index < elements.length) {
        const element = elements[index];
        const isFalsy = element === null || element === false || element === undefined;

        if (isFalsy) {
            index++;
            continue;
        }

        if (oldFiber.key !== element.key || oldFiber.type !== element.type) {
            break;
        }

        // Key and Type match, reuse!
        const newFiber = {
            type: oldFiber.type,
            key: oldFiber.key,
            props: element.props,
            stateNode: oldFiber.stateNode,
            return: wipFiber,
            alternate: oldFiber,
            effectTag: Update,
            index: index,
        };

        if (index === 0) {
            wipFiber.child = newFiber;
        } else if (prevSibling) {
            prevSibling.sibling = newFiber;
        }
        prevSibling = newFiber;

        oldFiber = oldFiber.sibling;
        index++;
    }

    // 2. If we finished all new elements, delete remaining old fibers
    if (index === elements.length) {
        while (oldFiber) {
            oldFiber.effectTag = Deletion;
            root.deletions.push(oldFiber);
            oldFiber = oldFiber.sibling;
        }
        return;
    }

    // 3. If we ran out of old fibers, create new ones for remaining elements
    if (!oldFiber) {
        while (index < elements.length) {
            const element = elements[index];
            if (element != null && element !== false) {
                const newFiber = {
                    type: element.type,
                    key: element.key || null,
                    props: element.props,
                    stateNode: null,
                    return: wipFiber,
                    alternate: null,
                    effectTag: Placement,
                    index: index,
                };

                if (index === 0) wipFiber.child = newFiber;
                else if (prevSibling) prevSibling.sibling = newFiber;
                prevSibling = newFiber;
            }
            index++;
        }
        return;
    }

    // 4. Map-based matching for reordering
    // Create a map of remaining old fibers
    const existingChildren = new Map();
    let scanOld = oldFiber;
    let oldIndex = index; // The current index in the old list
    while (scanOld) {
        const key = scanOld.key !== null ? scanOld.key : oldIndex;
        existingChildren.set(key, scanOld);
        scanOld = scanOld.sibling;
        oldIndex++;
    }

    while (index < elements.length) {
        const element = elements[index];
        if (element == null || element === false) {
            index++;
            continue;
        }

        const key = element.key !== null && element.key !== undefined ? element.key : index;
        const matchedOld = existingChildren.get(key);
        let newFiber;

        if (matchedOld && matchedOld.type === element.type) {
            // Found a match! Reuse.
            existingChildren.delete(key);
            newFiber = {
                type: matchedOld.type,
                key: matchedOld.key,
                props: element.props,
                stateNode: matchedOld.stateNode,
                return: wipFiber,
                alternate: matchedOld,
                effectTag: Update,
                index: index,
            };

            // Movement detection: if the old position is to the left of where we've placed, it moved.
            if (matchedOld.index < lastPlacedIndex) {
                newFiber.effectTag = Placement | Update;
            } else {
                lastPlacedIndex = matchedOld.index;
            }
        } else {
            // No match, create new.
            newFiber = {
                type: element.type,
                key: element.key || null,
                props: element.props,
                stateNode: null,
                return: wipFiber,
                alternate: null,
                effectTag: Placement,
                index: index,
            };
        }

        if (index === 0) wipFiber.child = newFiber;
        else if (prevSibling) prevSibling.sibling = newFiber;
        prevSibling = newFiber;
        index++;
    }

    // 5. Delete anything left in the map
    existingChildren.forEach(child => {
        child.effectTag = Deletion;
        root.deletions.push(child);
    });
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
    const prevProps = prev || {};
    const nextProps = next || {};

    Object.keys(prevProps).filter(isEvent).filter(k => !(k in nextProps) || isNew(prevProps, nextProps)(k)).forEach(n => {
        dom.removeEventListener(n.toLowerCase().substring(2), prevProps[n]);
    });
    Object.keys(prevProps).filter(isProperty).filter(isGone(prevProps, nextProps)).forEach(n => {
        if (n === 'style' && typeof prevProps[n] === 'object') {
            Object.keys(prevProps[n]).forEach(s => dom.style[s] = '');
        } else {
            dom[n] = '';
        }
    });
    Object.keys(nextProps).filter(isProperty).filter(isNew(prevProps, nextProps)).forEach(n => {
        if (n === 'style' && typeof nextProps[n] === 'object') {
            Object.assign(dom.style, nextProps[n]);
        } else {
            dom[n] = nextProps[n];
        }
    });
    Object.keys(nextProps).filter(isEvent).filter(isNew(prevProps, nextProps)).forEach(n => {
        dom.addEventListener(n.toLowerCase().substring(2), nextProps[n]);
    });
}

export { scheduleUpdate };
export function getWipFiber() { return wipFiber; }
export function getHookIndex() { return hookIndex; }
export function setHookIndex(v) { hookIndex = v; }
export function getCurrentRootFiber() { return currentRootFiber; }
