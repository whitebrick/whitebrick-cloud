import { QueryResult } from "pg";

export class Tenant {
  id!: number;
  name!: string;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;

  public static parseResult(data: QueryResult | null): Array<Tenant> {
    if (!data) throw new Error("Tenant.parseResult: input is null");
    const tenants = Array<Tenant>();
    data.rows.forEach((row: any) => {
      tenants.push(Tenant.parse(row));
    });
    return tenants;
  }

  public static parse(data: any): Tenant {
    if (!data) throw new Error("Tenant.parse: input is null");
    const tenant = new Tenant();
    tenant.id = data.id;
    tenant.name = data.name;
    tenant.label = data.label;
    tenant.createdAt = data.created_at;
    tenant.updatedAt = data.updated_at;
    return tenant;
  }
}
