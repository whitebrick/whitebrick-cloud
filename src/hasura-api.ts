// https://altrim.io/posts/axios-http-client-using-typescript

import axios, { AxiosInstance, AxiosResponse } from "axios";
import { ServiceResult } from "./types";
import { log } from "./whitebrick-cloud";

const headers: Readonly<Record<string, string | boolean>> = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "x-hasura-admin-secret": "Ha5uraWBStaging",
};

class HasuraApi {
  static HASURA_IGNORE_CODES: string[] = [
    "already-untracked",
    "already-tracked",
  ];
  private instance: AxiosInstance | null = null;

  private get http(): AxiosInstance {
    return this.instance != null ? this.instance : this.initHasuraApi();
  }

  initHasuraApi() {
    const http = axios.create({
      baseURL: "http://localhost:8080",
      headers,
      withCredentials: false,
    });

    this.instance = http;
    return http;
  }

  private async post(type: string, args: Record<string, any>) {
    let result: ServiceResult;
    try {
      log.debug(`hasuraApi.post: type: ${type}`, args);
      const response = await this.http.post<any, AxiosResponse>(
        "/v1/metadata",
        {
          type: type,
          args: args,
        }
      );
      result = {
        success: true,
        payload: response,
      };
    } catch (error) {
      if (!HasuraApi.HASURA_IGNORE_CODES.includes(error.response.data.code)) {
        if (error.response && error.response.data) {
          log.error(error.response.data);
        } else {
          log.error(error);
        }
      }
      result = {
        success: false,
        message: error.response.data.error,
        code: error.response.data.code,
      };
    }
    return result;
  }

  public async trackTable(schemaName: string, tableName: string) {
    const result = await this.post("pg_track_table", {
      table: {
        schema: schemaName,
        name: tableName,
      },
    });
    if (
      !result.success &&
      result.code &&
      HasuraApi.HASURA_IGNORE_CODES.includes(result.code)
    ) {
      return <ServiceResult>{
        success: true,
        payload: true,
        message: result.code,
      };
    }
    return result;
  }

  public async untrackTable(schemaName: string, tableName: string) {
    const result = await this.post("pg_untrack_table", {
      table: {
        schema: schemaName,
        name: tableName,
      },
      cascade: true,
    });
    if (
      !result.success &&
      result.code &&
      HasuraApi.HASURA_IGNORE_CODES.includes(result.code)
    ) {
      return <ServiceResult>{
        success: true,
        payload: true,
        message: result.code,
      };
    }
    return result;
  }

  // a post has one author (constraint posts.author_id -> authors.id)
  public async createObjectRelationship(
    schemaName: string,
    tableName: string, // posts
    columnName: string, // author_id
    parentTableName: string // authors
  ) {
    log.debug(
      `hasuraApi.createObjectRelationship(${schemaName}, ${tableName}, ${columnName}, ${parentTableName})`
    );
    const result = await this.post("pg_create_object_relationship", {
      name: `obj_${tableName}_${parentTableName}`, // obj_posts_authors
      table: {
        schema: schemaName,
        name: tableName, // posts
      },
      using: {
        foreign_key_constraint_on: columnName, // author_id
      },
    });
    if (
      !result.success &&
      result.code &&
      HasuraApi.HASURA_IGNORE_CODES.includes(result.code)
    ) {
      return <ServiceResult>{
        success: true,
        payload: true,
        message: result.code,
      };
    }
    return result;
  }

  // an author has many posts (constraint posts.author_id -> authors.id)
  public async createArrayRelationship(
    schemaName: string,
    tableName: string, // authors
    childTableName: string, // posts
    childColumnNames: string[] // author_id
  ) {
    log.debug(
      `hasuraApi.createArrayRelationship(${schemaName}, ${tableName}, ${childTableName}, ${childColumnNames})`
    );
    const result = await this.post("pg_create_array_relationship", {
      name: `arr_${tableName}_${childTableName}`, // arr_authors_posts
      table: {
        schema: schemaName,
        name: tableName, // authors
      },
      using: {
        foreign_key_constraint_on: {
          column: childColumnNames[0], // author_id
          table: {
            schema: schemaName,
            name: childTableName, // posts
          },
        },
      },
    });
    if (
      !result.success &&
      result.code &&
      HasuraApi.HASURA_IGNORE_CODES.includes(result.code)
    ) {
      return <ServiceResult>{
        success: true,
        payload: true,
        message: result.code,
      };
    }
    return result;
  }

  public async dropRelationships(
    schemaName: string,
    tableName: string, // posts
    parentTableName: string // authors
  ) {
    let result = await this.post("pg_drop_relationship", {
      table: {
        schema: schemaName,
        name: tableName, // posts
      },
      relationship: `obj_${tableName}_${parentTableName}`, // obj_posts_authors
    });
    if (
      !result.success &&
      (!result.code ||
        (result.code && !HasuraApi.HASURA_IGNORE_CODES.includes(result.code)))
    ) {
      return result;
    }
    result = await this.post("pg_drop_relationship", {
      table: {
        schema: schemaName,
        name: parentTableName, // authors
      },
      relationship: `arr_${parentTableName}_${tableName}`, // arr_authors_posts
    });
    if (
      !result.success &&
      result.code &&
      HasuraApi.HASURA_IGNORE_CODES.includes(result.code)
    ) {
      return <ServiceResult>{
        success: true,
        payload: true,
        message: result.code,
      };
    }
    return result;
  }

  // TBD-SG
  // use trackTable as tamplate
  // public async trackRelationship(schemaName: string, tableName: string, objectOrArray: string, relationshipName: string, constraintTable: string, constraintColumn: string) {
  // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#using-foreign-key-constraint-on-a-remote-table
  // https://hasura.io/docs/latest/graphql/core/api-reference/metadata-api/relationship.html#id3
}

export const hasuraApi = new HasuraApi();
