import { BadRequestException, Controller, Delete, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import { UserService } from './user.service';

@Controller('api/career-agent/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Delete(':id')
  deleteUser(@Req() req: Request, @Param('id') id: string) {
    const targetUserIdentity = id.trim();
    if (!targetUserIdentity) {
      throw new BadRequestException('Invalid user id');
    }
    return this.userService.deleteUserCascade(targetUserIdentity, req.userId);
  }
}
