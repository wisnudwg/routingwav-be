import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { GoogleAuthService } from './google-auth.service'
import { PasswordService } from './password.service'
import { SessionService } from './session.service'

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, PasswordService, GoogleAuthService],
  exports: [SessionService, PasswordService],
})
export class AuthModule {}