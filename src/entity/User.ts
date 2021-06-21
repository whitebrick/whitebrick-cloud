import { QueryResult } from "pg";

export class User {
  static HASURA_ADMIN_ID: number = 1;

  id!: number;
  organization_id!: number;
  email!: string;
  firstName?: string;
  lastName?: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role?: string;

  public static isSysAdmin(uid: number) {
    return uid == User.HASURA_ADMIN_ID;
  }

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
    user.id = data.id;
    user.email = data.email;
    if (data.first_name) user.firstName = data.first_name;
    if (data.last_name) user.lastName = data.last_name;
    user.createdAt = data.created_at;
    user.updatedAt = data.updated_at;
    if (data.role) user.role = data.role;
    return user;
  }
}
