import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import passportJwt from 'passport-jwt';
const { ExtractJwt, Strategy } = passportJwt;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-min-32-chars',
    });
  }

  /** Whatever we put in the access token becomes req.user */
  async validate(payload: any) {
    return {
      sub: payload.sub,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions: payload.permissions ?? [],
    };
  }
}
