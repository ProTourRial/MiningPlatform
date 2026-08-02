/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS = 'miningplatform.required-permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);
