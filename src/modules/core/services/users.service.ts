import usersData from '../config/users.json';

export type UserRole = 'SUPER_ADMIN' | 'DIRECCION_GENERAL' | 'PARTICULAR' | 'SECRETARIA' | 'OPERATIVO';

export interface User {
  id:    number;
  name:  string;
  email: string;
  role:  UserRole;
  area:  string;
}

const users: User[] = usersData as User[];

export class UsersService {
  findById(id: number): User | undefined {
    return users.find((u) => u.id === id);
  }

  findByArea(area: string): User[] {
    return users.filter((u) => u.area === area);
  }
}

export const usersService = new UsersService();
