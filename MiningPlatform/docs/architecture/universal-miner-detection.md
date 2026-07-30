# Universal Miner Detection

Author: Abia Nugrahanto

## Decision

MiningPlatform does not restrict workers to ASIC devices. A worker may represent CPU, GPU, FPGA, ASIC, hybrid rigs, or other compatible hardware.

The current mining algorithm remains BTC/SHA-256. Hardware compatibility and algorithm compatibility are separate concerns.

## Detection hierarchy

1. Monitoring agent or miner API observations.
2. User-declared hardware type.
3. Stratum `mining.subscribe` user-agent signature.
4. Unknown with explicit possible types when evidence is ambiguous.

Every result stores its source, confidence, possible types, evidence, software identity, device count, and algorithm capabilities.

## Honesty rule

XMRig, CGMiner, BFGMiner, and other multi-device software must not be treated as proof of one hardware class. Ambiguous signatures remain `UNKNOWN` until agent, API, or user evidence is available.

## Current boundary

CPU, GPU, FPGA, and ASIC miners can connect only when their software speaks compatible Stratum V1 and mines the active SHA-256 algorithm. Other algorithms require dedicated job codecs and validators.
