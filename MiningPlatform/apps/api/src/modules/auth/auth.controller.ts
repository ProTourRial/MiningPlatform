/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { hmacSensitiveValue } from '@mining/security';
import type { Request, Response } from 'express';
import { authRuntimeConfig } from './auth-config.js';
import { CurrentPrincipal, type AuthPrincipal } from './auth.decorators.js';
import { AuthGuard } from './auth.guard.js';
import { AuthRateLimitGuard } from './auth-rate-limit.guard.js';
import {
  DisableTotpDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  StepUpAuthorizationDto,
  TokenDto,
  TotpCodeDto,
} from './auth.dto.js';
import { AuthService, type RequestFingerprint } from './auth.service.js';
import { googleOAuthRuntimeConfig } from './google-oauth-config.js';
import { GoogleOAuthService } from './google-oauth.service.js';
import { StepUpService } from './step-up.service.js';

const REFRESH_COOKIE = 'mp_refresh';
const ACCESS_COOKIE = 'mp_access';
const GOOGLE_OAUTH_BINDING_COOKIE = 'mp_google_oauth_binding';
const GOOGLE_OAUTH_SECURE_BINDING_COOKIE = '__Host-mp_google_oauth_binding';

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function fingerprint(request: Request, userAgent: string | undefined): RequestFingerprint {
  const key = process.env.AUTH_IP_HASH_KEY ?? process.env.STRATUM_IP_HASH_KEY;
  if (!key || key.length < 16) return {};
  const remote = request.ip || request.socket.remoteAddress || 'unknown';
  return {
    ipHash: hmacSensitiveValue(remote.replace(/^::ffff:/, ''), key),
    userAgentHash: userAgent ? hmacSensitiveValue(userAgent, key) : undefined,
  };
}

function writeAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
  const config = authRuntimeConfig();
  response.cookie(ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/',
    maxAge: config.accessTokenSeconds * 1_000,
  });
  response.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: 'strict',
    path: '/api/v1/auth',
    maxAge: config.refreshTokenDays * 86_400_000,
  });
}

function googleOAuthBindingCookie() {
  const config = googleOAuthRuntimeConfig();
  if (!config.enabled) throw new UnauthorizedException('Google Sign-In is not enabled');
  const secure = new URL(config.returnOrigin).protocol === 'https:';
  return {
    name: secure ? GOOGLE_OAUTH_SECURE_BINDING_COOKIE : GOOGLE_OAUTH_BINDING_COOKIE,
    secure,
    maxAge: config.attemptTtlSeconds * 1_000,
  };
}

type GoogleOAuthBindingCookie = ReturnType<typeof googleOAuthBindingCookie>;

function writeGoogleOAuthBindingCookie(
  response: Response,
  browserBinding: string,
  cookie: GoogleOAuthBindingCookie,
): void {
  response.cookie(cookie.name, browserBinding, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax',
    path: '/',
    maxAge: cookie.maxAge,
  });
  response.setHeader('Cache-Control', 'no-store');
}

function readGoogleOAuthBindingCookie(
  header: string | undefined,
  cookie: GoogleOAuthBindingCookie,
): string | undefined {
  return cookieValue(header, cookie.name);
}

function clearGoogleOAuthBindingCookie(
  response: Response,
  cookie: GoogleOAuthBindingCookie,
): void {
  response.clearCookie(cookie.name, {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: 'lax',
    path: '/',
  });
  response.setHeader('Cache-Control', 'no-store');
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly stepUpService: StepUpService,
    private readonly googleOAuthService: GoogleOAuthService,
  ) {}

  @Get('status')
  getStatus() {
    return {
      module: 'auth',
      status: 'control-plane-alpha',
      capabilities: [
        'registration',
        'jwt-access-token',
        'rotating-refresh-token',
        'email-verification',
        'password-reset',
        'totp-2fa',
        'single-use-step-up',
      ],
      oauth: { google: this.googleOAuthService.publicStatus() },
    };
  }

  @Get('google/start')
  @UseGuards(AuthRateLimitGuard)
  async startGoogleSignIn(@Query('next') next: string | undefined, @Res() response: Response) {
    const bindingCookie = googleOAuthBindingCookie();
    const request = await this.googleOAuthService.startSignIn(next);
    writeGoogleOAuthBindingCookie(response, request.browserBinding, bindingCookie);
    return response.redirect(request.authorizationUrl);
  }

  @Get('google/callback')
  @UseGuards(AuthRateLimitGuard)
  async completeGoogleSignIn(
    @Query('state') state: string | undefined,
    @Query('code') code: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const bindingCookie = googleOAuthBindingCookie();
    const browserBinding = readGoogleOAuthBindingCookie(request.headers.cookie, bindingCookie);
    try {
      if (providerError) await this.googleOAuthService.cancel(state ?? '', browserBinding);
      if (!state || !code) throw new Error('OAuth callback is incomplete');
      const result = await this.googleOAuthService.complete(
        { state, code },
        fingerprint(request, userAgent),
        browserBinding,
      );
      if (result.purpose === 'SIGN_IN') {
        writeAuthCookies(response, result.session.accessToken, result.session.refreshToken);
      }
      clearGoogleOAuthBindingCookie(response, bindingCookie);
      return response.redirect(this.googleOAuthService.successUrl(result.redirectPath));
    } catch (error) {
      clearGoogleOAuthBindingCookie(response, bindingCookie);
      return response.redirect(this.googleOAuthService.callbackErrorUrl(error));
    }
  }

  @Get('google/connection')
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  googleConnection(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.googleOAuthService.connection(principal.userId);
  }

  @Post('google/link/start')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  async startGoogleLink(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bindingCookie = googleOAuthBindingCookie();
    const request = await this.googleOAuthService.startLink(principal, stepUpToken);
    writeGoogleOAuthBindingCookie(response, request.browserBinding, bindingCookie);
    return { authorizationUrl: request.authorizationUrl };
  }

  @Post('google/unlink')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  unlinkGoogle(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
  ) {
    return this.googleOAuthService.unlink(principal, stepUpToken);
  }

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    return this.authService.register(dto, fingerprint(request, userAgent));
  }

  @Post('verify-email')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  verifyEmail(@Body() dto: TokenDto) {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent: string | undefined,
  ) {
    const session = await this.authService.login(dto, fingerprint(request, userAgent));
    writeAuthCookies(response, session.accessToken, session.refreshToken);
    const { refreshToken: _hidden, ...result } = session;
    return result;
  }

  @Post('refresh')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('user-agent') userAgent: string | undefined,
    @Headers('cookie') cookie: string | undefined,
  ) {
    const token = dto.refreshToken ?? cookieValue(cookie, REFRESH_COOKIE);
    if (!token) throw new UnauthorizedException('Refresh token is required');
    const session = await this.authService.refresh(token, fingerprint(request, userAgent));
    writeAuthCookies(response, session.accessToken, session.refreshToken);
    const { refreshToken: _hidden, ...result } = session;
    return result;
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  async logout(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logout(principal);
    response.clearCookie(ACCESS_COOKIE, { path: '/' });
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    return result;
  }

  @Post('forgot-password')
  @HttpCode(202)
  @UseGuards(AuthRateLimitGuard)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  beginTotpSetup(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.authService.beginTotpSetup(principal);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  enableTotp(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: TotpCodeDto) {
    return this.authService.enableTotp(principal, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  disableTotp(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: DisableTotpDto) {
    return this.authService.disableTotp(principal, dto);
  }

  @Post('step-up')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AuthGuard, AuthRateLimitGuard)
  stepUp(@CurrentPrincipal() principal: AuthPrincipal, @Body() dto: StepUpAuthorizationDto) {
    return this.stepUpService.issue(principal, dto);
  }
}
