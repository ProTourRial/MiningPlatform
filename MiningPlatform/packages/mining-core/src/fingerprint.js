/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import { createHash } from 'node:crypto';
export function createShareFingerprint(workerId, submission) {
    const canonical = [
        workerId,
        submission.jobId.toLowerCase(),
        submission.extranonce2.toLowerCase(),
        submission.networkTime.toLowerCase(),
        submission.nonce.toLowerCase(),
        submission.versionBits?.toLowerCase() ?? '',
    ].join(':');
    return createHash('sha256').update(canonical).digest('hex');
}
//# sourceMappingURL=fingerprint.js.map