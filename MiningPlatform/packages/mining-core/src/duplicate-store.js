/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export class InMemoryDuplicateShareStore {
    now;
    fingerprints = new Map();
    constructor(now = () => Date.now()) {
        this.now = now;
    }
    async reserve(fingerprint, expiresAt) {
        this.removeExpired(this.now());
        if (this.fingerprints.has(fingerprint))
            return false;
        this.fingerprints.set(fingerprint, expiresAt.getTime());
        return true;
    }
    async release(fingerprint) {
        this.fingerprints.delete(fingerprint);
    }
    removeExpired(now) {
        for (const [fingerprint, expiresAt] of this.fingerprints.entries()) {
            if (expiresAt <= now)
                this.fingerprints.delete(fingerprint);
        }
    }
}
//# sourceMappingURL=duplicate-store.js.map