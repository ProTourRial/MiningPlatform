/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */
export type StratumRequestId = string | number | null;
export interface StratumRequest {
    id: StratumRequestId;
    method: string;
    params: unknown[];
}
export interface StratumResponse {
    id: StratumRequestId;
    result: unknown;
    error: null | [number, string, unknown?];
}
export interface StratumNotification {
    id: null;
    method: string;
    params: unknown[];
}
export type StratumMessage = StratumRequest | StratumResponse;
export interface MiningConfigureRequest {
    extensions: string[];
    options: Record<string, unknown>;
}
export interface MiningSubscribeRequest {
    userAgent?: string;
    sessionId?: string;
}
export interface MiningAuthorizeRequest {
    workerName: string;
    password: string;
}
export interface MiningSubmitRequest {
    workerName: string;
    jobId: string;
    extranonce2: string;
    networkTime: string;
    nonce: string;
    versionBits?: string;
}
export interface MiningSubscribeResult {
    subscriptions: Array<[string, string]>;
    extranonce1: string;
    extranonce2Size: number;
}
export interface MiningSetDifficultyNotification {
    difficulty: string;
}
export interface MiningSetExtranonceNotification {
    extranonce1: string;
    extranonce2Size: number;
}
export interface MiningNotifyNotification {
    jobId: string;
    previousBlockHash: string;
    coinbase1: string;
    coinbase2: string;
    merkleBranches: string[];
    version: string;
    networkBits: string;
    networkTime: string;
    cleanJobs: boolean;
}
export declare const StratumErrorCode: {
    readonly other: 20;
    readonly staleShare: 21;
    readonly duplicateShare: 22;
    readonly lowDifficultyShare: 23;
    readonly unauthorizedWorker: 24;
    readonly notSubscribed: 25;
};
export declare function parseStratumMessage(line: string): StratumMessage;
export declare function parseStratumLine(line: string): StratumRequest;
export declare function parseMiningConfigure(params: unknown[]): MiningConfigureRequest;
export declare function parseMiningSubscribe(params: unknown[]): MiningSubscribeRequest;
export declare function parseMiningAuthorize(params: unknown[]): MiningAuthorizeRequest;
export declare function parseMiningSubmit(params: unknown[]): MiningSubmitRequest;
export declare function parseMiningSubscribeResult(result: unknown): MiningSubscribeResult;
export declare function parseMiningSetDifficulty(params: unknown[]): MiningSetDifficultyNotification;
export declare function parseMiningSetExtranonce(params: unknown[]): MiningSetExtranonceNotification;
export declare function parseMiningNotify(params: unknown[]): MiningNotifyNotification;
export declare function serializeStratumRequest(request: StratumRequest): string;
export declare function serializeStratumResponse(response: StratumResponse): string;
export declare function serializeStratumNotification(method: string, params: unknown[]): string;
export declare function successResponse(id: StratumRequestId, result: unknown): StratumResponse;
export declare function errorResponse(id: StratumRequestId, code: number, message: string, data?: unknown): StratumResponse;
