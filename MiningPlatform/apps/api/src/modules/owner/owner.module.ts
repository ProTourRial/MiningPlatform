import { Module } from '@nestjs/common';

// Owner operations are intentionally not exposed until private-network access,
// mandatory 2FA, step-up authentication, and audit controls are implemented.
@Module({})
export class OwnerModule {}
