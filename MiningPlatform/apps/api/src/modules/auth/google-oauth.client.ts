/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { googleOAuthRuntimeConfig } from './google-oauth-config.js';

export interface GoogleAuthorizationRequest {
  authorizationUrl: string;
  codeVerifier: string;
}

export interface VerifiedGoogleIdentity {
  subject: string;
  email: string;
  emailVerified: boolean;
  nonce: string;
}

export abstract class GoogleIdentityClient {
  abstract createAuthorizationRequest(
    state: string,
    nonce: string,
  ): Promise<GoogleAuthorizationRequest>;

  abstract exchangeAndVerify(code: string, codeVerifier: string): Promise<VerifiedGoogleIdentity>;
}

@Injectable()
export class GoogleOAuthClient extends GoogleIdentityClient {
  private configuredClient(): { client: OAuth2Client; clientId: string } {
    const config = googleOAuthRuntimeConfig();
    if (!config.enabled) throw new ServiceUnavailableException('Google Sign-In is not enabled');
    return {
      client: new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri),
      clientId: config.clientId,
    };
  }

  async createAuthorizationRequest(
    state: string,
    nonce: string,
  ): Promise<GoogleAuthorizationRequest> {
    const { client } = this.configuredClient();
    const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
    if (!codeChallenge) throw new ServiceUnavailableException('Google PKCE setup failed');
    return {
      codeVerifier,
      authorizationUrl: client.generateAuthUrl({
        access_type: 'online',
        scope: ['openid', 'email', 'profile'],
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        include_granted_scopes: false,
        prompt: 'select_account',
      }),
    };
  }

  async exchangeAndVerify(code: string, codeVerifier: string): Promise<VerifiedGoogleIdentity> {
    const { client, clientId } = this.configuredClient();
    const { tokens } = await client.getToken({ code, codeVerifier });
    if (!tokens.id_token) throw new Error('Google token response did not include an ID token');
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || typeof payload.nonce !== 'string') {
      throw new Error('Google ID token is missing required OpenID claims');
    }
    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      nonce: payload.nonce,
    };
  }
}
