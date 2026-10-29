import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { MemberEmailController } from './member-email.controller'
import { TeamController } from './team.controller'
import { TeamService } from './team.service'

@Module({
  imports: [AuthModule],
  controllers: [TeamController, MemberEmailController],
  providers: [TeamService],
})
export class TeamModule {}