import { QueryResult } from "pg";
import { USER_MESSAGES } from "../environment";

export class User {
  // placeholders - should match db/seed.sql
  static SYS_ADMIN_ID: number = 1;
  static SYS_ADMIN_EMAIL: string = "sys_admin@example.com";
  static PUBLIC_USER_ID: number = 2;
  static PUBLIC_USER_EMAIL: string = "public_user@example.com";

  id!: number;
  email!: string;
  firstName?: string;
  lastName?: string;
  createdAt!: Date;
  updatedAt!: Date;

  public static parseResult(data: QueryResult | null): Array<User> {
    if (!data) throw new Error("User.parseResult: input is null");
    const users = Array<User>();
    data.rows.forEach((row: any) => {
      users.push(User.parse(row));
    });
    return users;
  }

  public static parse(data: Record<string, any>): User {
    if (!data) throw new Error("User.parse: input is null");
    const user = new User();
    user.id = parseInt(data.id);
    user.email = data.email;
    if (data.first_name) user.firstName = data.first_name;
    if (data.last_name) user.lastName = data.last_name;
    user.createdAt = data.created_at;
    user.updatedAt = data.updated_at;
    return user;
  }

  public static getSysAdminUser(): User {
    const date: Date = new Date();
    const user: User = new User();
    user.id = User.SYS_ADMIN_ID;
    user.email = "SYS_ADMIN@example.com";
    user.firstName = "SYS Admin";
    user.lastName = "SYS Admin";
    user.createdAt = date;
    user.updatedAt = date;
    return user;
  }

  public static getPublicUser(): User {
    const date: Date = new Date();
    const user: User = new User();
    user.id = User.PUBLIC_USER_ID;
    user.email = "PUBLIC@example.com";
    user.firstName = "Public User";
    user.lastName = "Public User";
    user.createdAt = date;
    user.updatedAt = date;
    return user;
  }
}
