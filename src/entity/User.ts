import { QueryResult } from "pg";

export class User {
  id!: number;
  tenant_id!: number;
  email!: string;
  firstName!: string;
  lastName!: string;
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

  public static parse(data: any): User {
    if (!data) throw new Error("User.parse: input is null");
    const user = new User();
    user.id = data.id;
    user.email = data.email;
    user.firstName = data.first_name;
    user.lastName = data.last_name;
    user.createdAt = data.created_at;
    user.updatedAt = data.updated_at;
    return user;
  }
}
