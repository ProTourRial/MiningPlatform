/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
const transitions = {
    RECEIVED: ['VALIDATING'],
    VALIDATING: ['LOCAL_ACCEPTED', 'LOCAL_REJECTED'],
    LOCAL_ACCEPTED: ['UPSTREAM_PENDING'],
    LOCAL_REJECTED: [],
    UPSTREAM_PENDING: ['UPSTREAM_ACCEPTED', 'UPSTREAM_REJECTED', 'UPSTREAM_TIMEOUT'],
    UPSTREAM_ACCEPTED: [],
    UPSTREAM_REJECTED: [],
    UPSTREAM_TIMEOUT: ['UPSTREAM_PENDING'],
};
export function transitionShareState(from, to) {
    if (!transitions[from].includes(to))
        throw new Error(`Illegal share transition: ${from} -> ${to}`);
    return to;
}
export function canTransitionShareState(from, to) {
    return transitions[from].includes(to);
}
//# sourceMappingURL=share-state-machine.js.map