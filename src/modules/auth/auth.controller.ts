import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.phone, dto.password, dto.asDoctor ?? false);
  }

  /** Strict rate limit: 5 attempts / minute (Redis-backed in prod via throttler storage). */
  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    const identifier = dto.identifier ?? dto.email ?? dto.phone;
    if (!identifier) throw new BadRequestException('email or phone is required');
    return this.auth.login(identifier, dto.password);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: AuthUser, @Body() dto: Partial<RefreshDto>) {
    return this.auth.logout(user.sub, dto.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.sub);
  }

  @Post('otp/issue')
  @HttpCode(200)
  issueOtp(@CurrentUser() user: AuthUser) {
    return this.auth.issueOtp(user.sub);
  }

  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@CurrentUser() user: AuthUser, @Body() body: { code: string }) {
    return this.auth.verifyOtp(user.sub, body.code);
  }
}
