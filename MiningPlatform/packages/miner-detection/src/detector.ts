/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import type {
  ComputeDeviceObservation,
  HardwareDetectionConfidence,
  HardwareType,
  MinerDetectionInput,
  MinerDetectionResult,
} from './types.js';

interface SignatureRule {
  pattern: RegExp;
  software: string;
  detectedType: HardwareType;
  possibleTypes?: readonly HardwareType[];
  confidence: HardwareDetectionConfidence;
}

const SIGNATURE_RULES: readonly SignatureRule[] = [
  { pattern: /antminer|bitmain|braiins(?:[ /-]?os)?|vnish|luxos/i, software: 'ASIC firmware', detectedType: 'ASIC', confidence: 'HIGH' },
  { pattern: /whatsminer|microbt/i, software: 'WhatsMiner firmware', detectedType: 'ASIC', confidence: 'HIGH' },
  { pattern: /avalonminer|canaan/i, software: 'AvalonMiner firmware', detectedType: 'ASIC', confidence: 'HIGH' },
  { pattern: /t-?rex|teamredminer|lolminer|gminer|nbminer|phoenixminer|bzminer|rigel|ethminer/i, software: 'GPU miner', detectedType: 'GPU', confidence: 'HIGH' },
  { pattern: /cpuminer|minerd/i, software: 'CPU miner', detectedType: 'CPU', confidence: 'HIGH' },
  { pattern: /fpga|blackminer|atomminer/i, software: 'FPGA miner', detectedType: 'FPGA', confidence: 'MEDIUM' },
  { pattern: /xmrig/i, software: 'XMRig', detectedType: 'UNKNOWN', possibleTypes: ['CPU', 'GPU'], confidence: 'LOW' },
  { pattern: /cgminer|bfgminer/i, software: 'CGMiner-compatible', detectedType: 'UNKNOWN', possibleTypes: ['ASIC', 'FPGA', 'GPU'], confidence: 'LOW' },
];

function extractVersion(userAgent: string): string | undefined {
  return userAgent.match(/(?:\/|\s|v)(\d+(?:\.\d+){0,3})/i)?.[1];
}

function uniqueTypes(types: readonly HardwareType[]): HardwareType[] {
  return [...new Set(types)];
}

function summarizeObservations(observations: readonly ComputeDeviceObservation[]): Pick<
  MinerDetectionResult,
  'detectedType' | 'possibleTypes' | 'vendor' | 'model' | 'architecture' | 'operatingSystem' | 'deviceCount' | 'algorithmCapabilities' | 'evidence'
> {
  const types = uniqueTypes(observations.map((observation) => observation.hardwareType).filter((type) => type !== 'UNKNOWN'));
  const detectedType: HardwareType = types.length === 0 ? 'UNKNOWN' : types.length === 1 ? types[0]! : 'HYBRID';
  return {
    detectedType,
    possibleTypes: types.length ? types : ['UNKNOWN'],
    vendor: observations.find((item) => item.vendor)?.vendor,
    model: observations.find((item) => item.model)?.model,
    architecture: observations.find((item) => item.architecture)?.architecture,
    operatingSystem: observations.find((item) => item.operatingSystem)?.operatingSystem,
    deviceCount: observations.reduce((sum, observation) => sum + Math.max(1, observation.count ?? 1), 0),
    algorithmCapabilities: [...new Set(observations.flatMap((item) => item.algorithmCapabilities ?? []))],
    evidence: observations.map((item) => `${item.source}:${item.hardwareType}:${item.vendor ?? 'unknown'}:${item.model ?? 'unknown'}`),
  };
}

export function detectMinerIdentity(input: MinerDetectionInput): MinerDetectionResult {
  const observations = input.observations ?? [];
  const algorithmCapabilities = input.algorithm ? [input.algorithm.toUpperCase()] : [];
  const userAgent = input.userAgent?.trim();
  const matchingRule = userAgent ? SIGNATURE_RULES.find((rule) => rule.pattern.test(userAgent)) : undefined;

  if (observations.length > 0) {
    const summary = summarizeObservations(observations);
    const declaredMatches = input.declaredType && (input.declaredType === summary.detectedType || summary.possibleTypes.includes(input.declaredType));
    return {
      ...summary,
      detectionSource: input.declaredType ? 'COMBINED' : observations.some((item) => item.source === 'MINER_API') ? 'MINER_API' : 'MONITORING_AGENT',
      confidence: declaredMatches ? 'CONFIRMED' : 'HIGH',
      minerSoftware: matchingRule?.software,
      softwareVersion: userAgent ? extractVersion(userAgent) : undefined,
      algorithmCapabilities: [...new Set([...summary.algorithmCapabilities, ...algorithmCapabilities])],
      evidence: [...summary.evidence, ...(userAgent ? [`STRATUM_USER_AGENT:${userAgent}`] : [])],
    };
  }

  if (input.declaredType) {
    const signatureMatches = matchingRule && (
      matchingRule.detectedType === input.declaredType ||
      matchingRule.possibleTypes?.includes(input.declaredType)
    );
    return {
      detectedType: input.declaredType,
      possibleTypes: [input.declaredType],
      detectionSource: userAgent ? 'COMBINED' : 'USER_DECLARED',
      confidence: signatureMatches ? 'CONFIRMED' : 'HIGH',
      minerSoftware: matchingRule?.software,
      softwareVersion: userAgent ? extractVersion(userAgent) : undefined,
      deviceCount: 1,
      algorithmCapabilities,
      evidence: [
        `USER_DECLARED:${input.declaredType}`,
        ...(userAgent ? [`STRATUM_USER_AGENT:${userAgent}`] : []),
      ],
    };
  }

  if (matchingRule && userAgent) {
    return {
      detectedType: matchingRule.detectedType,
      possibleTypes: matchingRule.possibleTypes ?? [matchingRule.detectedType],
      detectionSource: 'STRATUM_USER_AGENT',
      confidence: matchingRule.confidence,
      minerSoftware: matchingRule.software,
      softwareVersion: extractVersion(userAgent),
      deviceCount: 1,
      algorithmCapabilities,
      evidence: [`STRATUM_USER_AGENT:${userAgent}`],
    };
  }

  return {
    detectedType: 'UNKNOWN',
    possibleTypes: ['CPU', 'GPU', 'FPGA', 'ASIC', 'OTHER'],
    detectionSource: userAgent ? 'STRATUM_USER_AGENT' : 'UNKNOWN',
    confidence: userAgent ? 'LOW' : 'UNKNOWN',
    softwareVersion: userAgent ? extractVersion(userAgent) : undefined,
    deviceCount: 1,
    algorithmCapabilities,
    evidence: userAgent ? [`UNRECOGNIZED_USER_AGENT:${userAgent}`] : [],
  };
}
