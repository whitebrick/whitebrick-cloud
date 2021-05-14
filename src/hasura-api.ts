// https://altrim.io/posts/axios-http-client-using-typescript

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import { ServiceResult } from "./type-defs";
import { log } from "./whitebrick-cloud";

const headers: Readonly<Record<string, string | boolean>> = {
  Accept: "application/json",
  "Content-Type": "application/json; charset=utf-8",
  "x-hasura-admin-secret": "Ha5uraWBStaging",
};

class HasuraApi {
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
      if (error.response && error.response.data) {
        log.error(error.response.data);
      } else {
        log.error(error);
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
    if (!result.success && result.code == "already-untracked") {
      return <ServiceResult>{
        success: true,
        payload: true,
      };
    }
    return result;
  }
}

export const hasuraApi = new HasuraApi();
