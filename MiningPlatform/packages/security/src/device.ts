/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

export interface DeviceMetadata {
  deviceName: string;
  deviceType: 'DESKTOP' | 'MOBILE' | 'TABLET' | 'UNKNOWN';
  browser: string;
  operatingSystem: string;
}

export function parseDeviceMetadata(userAgent = ''): DeviceMetadata {
  const ua = userAgent.toLowerCase();
  const operatingSystem = ua.includes('windows')
    ? 'Windows'
    : ua.includes('android')
      ? 'Android'
      : ua.includes('iphone') || ua.includes('ipad')
        ? 'iOS'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'macOS'
          : ua.includes('linux')
            ? 'Linux'
            : 'Unknown';
  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/')
      ? 'Chrome'
      : ua.includes('firefox/')
        ? 'Firefox'
        : ua.includes('safari/')
          ? 'Safari'
          : 'Unknown';
  const deviceType = ua.includes('ipad') || ua.includes('tablet')
    ? 'TABLET'
    : ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')
      ? 'MOBILE'
      : userAgent
        ? 'DESKTOP'
        : 'UNKNOWN';
  return { deviceName: `${operatingSystem} · ${browser}`, deviceType, browser, operatingSystem };
}
