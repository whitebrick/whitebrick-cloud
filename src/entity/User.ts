import { QueryResult } from "pg";

export class User {
  id!: number;
  tenant_id!: number;
  email!: string;
  firstName!: string;
  lastName!: string;
  createdAt!: Date;
  updatedAt!: Date;

  public static parseResult(data: QueryResult | null) {
    if (!data) throw new Error('User.parseResult: input is null');
    const users = Array<User>();
    data.rows.forEach((row: any) => {
      users.push(User.parse(row));
    });
    return users;
  }

  public static parse(data: any): User {
    if (!data) throw new Error('User.parse: input is null');
    const user = new User();
    user.id = data.id;
    user.tenant_id = data.tenant_id;
    user.email = data.email;
    user.firstName = data.firstName;
    user.lastName = data.lastName;
    user.createdAt = data.created_at.toString();
    user.updatedAt = data.updated_at.toString();
    return user;
  }
}