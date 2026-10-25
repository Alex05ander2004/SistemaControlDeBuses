import { Controller, Get } from '@nestjs/common';
import { Roles } from '../common/decorators';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles('ADMIN')
  list() {
    return this.users.list();
  }
}
