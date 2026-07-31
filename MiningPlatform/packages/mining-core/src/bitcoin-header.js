/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
import { createHash } from 'node:crypto';
import { bytesToHex, concatBytes, hexToBytes, reverseBytes, uint32LittleEndian } from './hex.js';
export function sha256(value) {
    return new Uint8Array(createHash('sha256').update(value).digest());
}
export function sha256d(value) {
    return sha256(sha256(value));
}
export function buildCoinbase(job, submission) {
    return hexToBytes(`${job.coinbase1}${job.extranonce1}${submission.extranonce2}${job.coinbase2}`);
}
export function buildMerkleRoot(job, submission) {
    let current = sha256d(buildCoinbase(job, submission));
    for (const branch of job.merkleBranches) {
        const branchInternal = hexToBytes(branch);
        current = sha256d(concatBytes(current, branchInternal));
    }
    return current;
}
export function resolveVersion(job, submittedVersionBits) {
    if (!submittedVersionBits)
        return job.version;
    if (!job.versionRollingMask)
        throw new Error('Version rolling was not negotiated');
    if (!/^[0-9a-f]{8}$/i.test(submittedVersionBits))
        throw new Error('Version bits must be four bytes');
    const base = Number.parseInt(job.version, 16) >>> 0;
    const mask = Number.parseInt(job.versionRollingMask, 16) >>> 0;
    const submitted = Number.parseInt(submittedVersionBits, 16) >>> 0;
    if ((submitted & ~mask) !== 0)
        throw new Error('Version bits exceed negotiated mask');
    return ((base & ~mask) | (submitted & mask)).toString(16).padStart(8, '0');
}
export function buildBlockHeader(job, submission) {
    const version = resolveVersion(job, submission.versionBits);
    const previousBlockHashInternal = hexToBytes(job.previousBlockHash);
    const merkleRootInternal = buildMerkleRoot(job, submission);
    return concatBytes(uint32LittleEndian(version, 'version'), previousBlockHashInternal, merkleRootInternal, uint32LittleEndian(submission.networkTime, 'network time'), uint32LittleEndian(job.networkBits, 'network bits'), uint32LittleEndian(submission.nonce, 'nonce'));
}
export function calculateHeaderHash(job, submission) {
    const digest = sha256d(buildBlockHeader(job, submission));
    const displayBytes = reverseBytes(digest);
    return {
        digest,
        displayHash: bytesToHex(displayBytes),
        numericValue: BigInt(`0x${bytesToHex(displayBytes)}`),
    };
}
//# sourceMappingURL=bitcoin-header.js.map