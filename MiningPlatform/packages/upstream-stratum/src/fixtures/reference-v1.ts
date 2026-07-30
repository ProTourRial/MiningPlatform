/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export const referenceStratumV1Fixture = {
  fixtureId: 'reference-cash-stratum-v1-example',
  source: 'https://reference.cash/mining/stratum-protocol',
  classification: 'public-reference-example',
  subscribeResult: [
    [
      ['mining.set_difficulty', '731ec5e0649606ff'],
      ['mining.notify', '731ec5e0649606ff'],
    ],
    'e9695791',
    4,
  ],
  difficulty: '1',
  notifyParams: [
    '4f',
    '4d16b6f85af6e2198f44ae2a6de67f78487ae5611b77c6c0440b921e00000000',
    '01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff20020862062f503253482f04b8864e5008',
    '072f736c7573682f000000000100f2052a010000001976a914d23fcdf86f7e756a64a7a9688ef9903327048ed988ac00000000',
    [],
    '00000002',
    '1c2ac4af',
    '504e86b9',
    false,
  ] as const,
  submission: {
    workerName: 'username',
    jobId: '4f',
    extranonce2: 'fe36a31b',
    networkTime: '504e86ed',
    nonce: 'e9695791',
  },
  expected: {
    coinbaseHashInternal: 'a928a1029b850493f969192a4e7f19b9106c46735938bc204ce5c58436d00259',
    headerHex: '020000004d16b6f85af6e2198f44ae2a6de67f78487ae5611b77c6c0440b921e00000000a928a1029b850493f969192a4e7f19b9106c46735938bc204ce5c58436d00259ed864e50afc42a1c915769e9',
    displayHash: '74b28b49a01a178842f32039b9f03278a60c68827edb2e94347b7a9eb81301ec',
  },
} as const;
