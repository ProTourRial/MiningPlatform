/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthPrincipal } from '../../common/auth/auth.types';
import { CurrentPrincipal } from '../../common/auth/current-principal.decorator';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { requestSecurityContext } from '../../common/auth/request-security-context';
import { AccessTokenGuard } from './access-token.guard';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  DisableTotpDto,
  EmailActionDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  RevokeSessionDto,
  TotpCodeDto,
  VerifyEmailDto,
} from './dto/auth.dto';
import { identityConfig } from './identity-config';
import { PermissionsGuard } from './permissions.guard';

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

function setSessionCookies(response: Response, tokens: { accessToken: string; refreshToken: string; accessExpiresInSeconds: number; refreshExpiresAt: string }) {
  const config = identityConfig();
  const secure = config.secureCookies ? 'Secure; ' : '';
  response.append('Set-Cookie', `mp_access=${encodeURIComponent(tokens.accessToken)}; Max-Age=${tokens.accessExpiresInSeconds}; HttpOnly; SameSite=Lax; Path=/; Priority=High; ${secure}`);
  const refreshMaxAge = Math.max(0, Math.floor((new Date(tokens.refreshExpiresAt).getTime() - Date.now()) / 1000));
  response.append('Set-Cookie', `mp_refresh=${encodeURIComponent(tokens.refreshToken)}; Max-Age=${refreshMaxAge}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Priority=High; ${secure}`);
}

function clearSessionCookies(response: Response) {
  const secure = identityConfig().secureCookies ? 'Secure; ' : '';
  response.append('Set-Cookie', `mp_access=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/; Priority=High; ${secure}`);
  response.append('Set-Cookie', `mp_refresh=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Priority=High; ${secure}`);
}

function bearerTransport(request: Request): boolean {
  return request.headers['x-mining-auth-transport'] === 'bearer';
}

function browserSessionResponse<T extends { accessToken: string; refreshToken: string }>(result: T) {
  const { accessToken: _accessToken, refreshToken: _refreshToken, ...safe } = result;
  return safe;
}

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterDto, @Req() request: Request) {
    return this.auth.register(input, requestSecurityContext(request));
  }

  @Post('login')
  async login(@Body() input: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(input, requestSecurityContext(request));
    setSessionCookies(response, result);
    return bearerTransport(request) ? result : browserSessionResponse(result);
  }

  @Post('refresh')
  async refresh(@Body() input: RefreshDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const refreshToken = input.refreshToken ?? cookieValue(request.headers.cookie, 'mp_refresh');
    if (!refreshToken) return { refreshed: false };
    const result = await this.auth.refresh(refreshToken, requestSecurityContext(request));
    setSessionCookies(response, result);
    return bearerTransport(request) ? result : browserSessionResponse(result);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  async logout(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(principal, requestSecurityContext(request));
    clearSessionCookies(response);
    return { loggedOut: true };
  }

  @Post('email/verify')
  verifyEmail(@Body() input: VerifyEmailDto, @Req() request: Request) {
    return this.auth.verifyEmail(input.token, requestSecurityContext(request));
  }

  @Post('email/resend')
  resendVerification(@Body() input: EmailActionDto, @Req() request: Request) {
    return this.auth.resendVerification(input.email, requestSecurityContext(request));
  }

  @Post('password/forgot')
  forgotPassword(@Body() input: EmailActionDto, @Req() request: Request) {
    return this.auth.forgotPassword(input.email, requestSecurityContext(request));
  }

  @Post('password/reset')
  resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request) {
    return this.auth.resetPassword(input, requestSecurityContext(request));
  }

  @Post('password/change')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  async changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Body() input: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.changePassword(principal, input, requestSecurityContext(request));
    clearSessionCookies(response);
    return result;
  }

  @Post('2fa/setup')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  setupTotp(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.setupTotp(principal);
  }

  @Post('2fa/enable')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  enableTotp(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: TotpCodeDto, @Req() request: Request) {
    return this.auth.enableTotp(principal, input, requestSecurityContext(request));
  }

  @Post('2fa/disable')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard)
  disableTotp(@CurrentPrincipal() principal: AuthPrincipal, @Body() input: DisableTotpDto, @Req() request: Request) {
    return this.auth.disableTotp(principal, input, requestSecurityContext(request));
  }

  @Get('sessions')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('sessions.read')
  sessions(@CurrentPrincipal() principal: AuthPrincipal) {
    return this.auth.listSessions(principal);
  }

  @Delete('sessions/all')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('sessions.revoke')
  async revokeAllSessions(@CurrentPrincipal() principal: AuthPrincipal, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.revokeAllSessions(principal);
    clearSessionCookies(response);
    return result;
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @UseGuards(AccessTokenGuard, PermissionsGuard)
  @RequirePermissions('sessions.revoke')
  async revokeSession(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Param('sessionId') sessionId: string,
    @Body() input: RevokeSessionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.revokeSession(principal, sessionId, input.reason);
    if (result.currentSession) clearSessionCookies(response);
    return result;
  }
}
