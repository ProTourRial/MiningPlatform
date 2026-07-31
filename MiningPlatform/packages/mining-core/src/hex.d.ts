/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export declare function assertHex(value: string, bytes?: number, field?: string): void;
export declare function hexToBytes(value: string): Uint8Array;
export declare function bytesToHex(value: Uint8Array): string;
export declare function reverseBytes(value: Uint8Array): Uint8Array;
export declare function concatBytes(...values: readonly Uint8Array[]): Uint8Array;
export declare function uint32LittleEndian(hex: string, field: string): Uint8Array;
