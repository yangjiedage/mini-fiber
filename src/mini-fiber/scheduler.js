// Priority constants
export const NoPriority = 0;
export const ImmediatePriority = 1;
export const UserBlockingPriority = 2;
export const NormalPriority = 3;
export const LowPriority = 4;
export const IdlePriority = 5;

// Max integers for expiration times
const MaxInt = 1073741823;
const IMMEDIATE_PRIORITY_TIMEOUT = -1;
const USER_BLOCKING_PRIORITY_TIMEOUT = 250;
const NORMAL_PRIORITY_TIMEOUT = 5000;
const LOW_PRIORITY_TIMEOUT = 10000;
const IDLE_PRIORITY_TIMEOUT = MaxInt;

let taskQueue = [];
let isPerformingWork = false;
let isHostCallbackScheduled = false;
let currentPriorityLevel = NormalPriority;

let currentTime = 0;
let yieldInterval = 5; // 5ms time slice
let deadline = 0;

export function now() {
    return performance.now();
}

export function getCurrentPriorityLevel() {
    return currentPriorityLevel;
}

export function shouldYield() {
    return now() >= deadline;
}

export function scheduleCallback(priorityLevel, callback) {
    const startTime = now();
    let timeout;
    switch (priorityLevel) {
        case ImmediatePriority:
            timeout = IMMEDIATE_PRIORITY_TIMEOUT;
            break;
        case UserBlockingPriority:
            timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
            break;
        case IdlePriority:
            timeout = IDLE_PRIORITY_TIMEOUT;
            break;
        case LowPriority:
            timeout = LOW_PRIORITY_TIMEOUT;
            break;
        case NormalPriority:
        default:
            timeout = NORMAL_PRIORITY_TIMEOUT;
            break;
    }

    const expirationTime = startTime + timeout;

    const newTask = {
        callback,
        priorityLevel,
        startTime,
        expirationTime,
        sortIndex: expirationTime,
    };

    taskQueue.push(newTask);
    taskQueue.sort((a, b) => a.sortIndex - b.sortIndex);

    if (!isHostCallbackScheduled && !isPerformingWork) {
        isHostCallbackScheduled = true;
        requestHostCallback();
    }

    return newTask;
}

function requestHostCallback() {
    const channel = new MessageChannel();
    const port = channel.port2;
    channel.port1.onmessage = performWorkUntilDeadline;
    port.postMessage(null);
}

function performWorkUntilDeadline() {
    if (isHostCallbackScheduled) {
        isHostCallbackScheduled = false;
        isPerformingWork = true;
        deadline = now() + yieldInterval;

        try {
            const hasMoreWork = flushWork();
            if (hasMoreWork) {
                isHostCallbackScheduled = true;
                requestHostCallback();
            }
        } finally {
            isPerformingWork = false;
        }
    }
}

function flushWork() {
    let currentTask = taskQueue[0];
    const previousPriorityLevel = currentPriorityLevel;
    try {
        while (currentTask) {
            if (currentTask.expirationTime > now() && shouldYield()) {
                break;
            }

            const callback = currentTask.callback;
            if (typeof callback === 'function') {
                currentPriorityLevel = currentTask.priorityLevel;
                currentTask.callback = null;
                const continuationCallback = callback(currentTask.expirationTime <= now());
                if (typeof continuationCallback === 'function') {
                    currentTask.callback = continuationCallback;
                } else {
                    if (currentTask === taskQueue[0]) {
                        taskQueue.shift();
                    }
                }
            } else {
                taskQueue.shift();
            }
            currentTask = taskQueue[0];
        }
    } finally {
        currentPriorityLevel = previousPriorityLevel;
    }
    return currentTask != null;
}
