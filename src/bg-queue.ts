import { DAL } from "./dal";
import { environment } from "./environment";
import { ServiceResult } from "./types";
import { errResult, log, WhitebrickCloud } from "./whitebrick-cloud";
import { CurrentUser } from "./entity/CurrentUser";
import Lambda from "aws-sdk/clients/lambda";
import axios, { AxiosResponse } from "axios";
import { mailer } from "./mailer";

export class BgQueue {
  dal: DAL;
  wbCloud: WhitebrickCloud;

  static BG_STATUS: Record<string, string> = {
    pending: "Pending",
    running: "Running",
    success: "Success",
    error: "Error",
  };

  static TABLE_BUSY_KEYS: string[] = [
    "bgImportSchema",
    "bgRemoveSchema",
    "bgRetrackSchema",
    "bgTrackAndAddDefaultTablePermissions",
    "bgTrackAndRemoveDefaultTablePermissions",
    "bgTrackAndRemoveAndAddDefaultTablePermissions",
  ];

  constructor(wbCloud: WhitebrickCloud, dal: DAL) {
    this.dal = dal;
    this.wbCloud = wbCloud;
  }

  public async ls(schemaId: number, limit?: number): Promise<ServiceResult> {
    log.info(`bgQueue.ls(${schemaId},${limit})`);
    const result = await this.dal.bgQueueSelect(
      ["id", "status", "key", "data", "created_at", "updated_at"],
      schemaId,
      undefined,
      limit,
      "updated_at DESC"
    );
    if (result.success) result.payload = result.payload.rows;
    return result;
  }

  public async queue(
    userId: number,
    schemaId: number,
    key: string,
    data?: object
  ): Promise<ServiceResult> {
    log.info(`bgQueue.queue(${key},${data})`);
    return await this.dal.bgQueueInsert(
      userId,
      schemaId,
      BgQueue.BG_STATUS.pending,
      key,
      data
    );
  }

  public async removeAllForSchema(schemaId: number): Promise<ServiceResult> {
    log.info(`bgQueue.removeAllForSchema(${schemaId})`);
    return await this.dal.bgQueueDelete(undefined, schemaId);
  }

  public async invoke(schemaId: number): Promise<ServiceResult> {
    let invokationResult;
    log.info(`bgQueue.invoke(${schemaId})`);
    try {
      if (environment.lambdaBgFunctionName) {
        const lambda = new Lambda({
          region: environment.awsRegion,
        });
        const params = {
          FunctionName: environment.lambdaBgFunctionName,
          InvocationType: "Event",
          Payload: JSON.stringify({
            schemaId: schemaId,
          }),
        };
        log.info(`Invoking lambda with params: ${JSON.stringify(params)}`);
        invokationResult = await lambda.invoke(params).promise();
      } else {
        log.info(`Posting to ${environment.localBgFunctionUrl}`);
        // don't wait for response
        invokationResult = axios
          .create()
          .post<any, AxiosResponse>(environment.localBgFunctionUrl, {
            query: `mutation { wbUtil(fn: "invokeBg", vals: {schemaId: ${schemaId}}) }`,
          });
      }
    } catch (error: any) {
      log.error(error);
      return errResult({
        message: error.message,
      }) as ServiceResult;
    }
    return { success: true, payload: invokationResult } as ServiceResult;
  }

  public async process(schemaId: number): Promise<ServiceResult> {
    log.info(`bgQueue.process(${schemaId})`);
    // 1. Is process already running?
    const isRunningResult = await this.dal.bgQueueSelect(
      ["id"],
      schemaId,
      BgQueue.BG_STATUS.running,
      1
    );
    if (!isRunningResult.success) return isRunningResult;
    if (isRunningResult.payload.rows.length == 1) {
      log.info(`bgQueue.process - already running`);
      return { success: true } as ServiceResult;
    }
    // 2. Lock pending jobs with status=running so no other process starts
    const setRunningResult = await this.dal.bgQueueUpdateStatus(
      BgQueue.BG_STATUS.running,
      undefined,
      schemaId,
      BgQueue.BG_STATUS.pending
    );
    if (!setRunningResult.success) return setRunningResult;
    // 3. Process each running job but lookup after each iteration
    // in case more jobs are added while running
    let running = true;
    while (running) {
      const bgJobFetchResult = await this.dal.bgQueueSelect(
        ["id", "key", "data"],
        schemaId,
        BgQueue.BG_STATUS.running,
        1
      );
      if (!bgJobFetchResult.success) return bgJobFetchResult;
      log.info(`  - bgJobFetchResult=${JSON.stringify(bgJobFetchResult)}`);
      if (bgJobFetchResult.payload.rows.length == 0) {
        log.info(`  - no jobs left to run`);
        return { success: true } as ServiceResult;
      }
      const bgJobProcessResult = await this.bgRun(
        bgJobFetchResult.payload.rows[0].id,
        bgJobFetchResult.payload.rows[0].key,
        bgJobFetchResult.payload.rows[0].data
      );
      if (!bgJobProcessResult.success) {
        const setErrorResult = await this.dal.bgQueueUpdateStatus(
          BgQueue.BG_STATUS.error,
          bgJobFetchResult.payload.rows[0].id,
          undefined,
          undefined,
          {
            data: bgJobFetchResult.payload.rows[0].data,
            error: bgJobProcessResult,
          }
        );
        if (!setErrorResult.success) return setErrorResult;
        log.info(`  - job returned error, added to data.error`);
      }
      const setSuccessResult = await this.dal.bgQueueUpdateStatus(
        BgQueue.BG_STATUS.success,
        bgJobFetchResult.payload.rows[0].id
      );
      if (!setSuccessResult.success) return setSuccessResult;
    }
    return { success: true } as ServiceResult;
  }

  public async bgRun(
    id: number,
    key: string,
    data: Record<string, any>
  ): Promise<ServiceResult> {
    log.info(`  bgQueue.bgRun - running job id=${id} key=${key} data=${data}`);
    let result: ServiceResult = errResult();
    const cU = CurrentUser.getSysAdmin();
    switch (key) {
      case "bgImportSchema":
        result = await this.wbCloud.addAllExistingTables(cU, data.schemaName);
        if (!result.success) break;
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName
        );
        if (!result.success) break;
        // reset the roles now that new tables exist
        result = await this.wbCloud.deleteAndSetTablePermissions(
          cU,
          undefined,
          data.schemaName
        );
        break;
      case "bgRemoveSchema":
        result = await this.wbCloud.removeOrDeleteSchema(
          cU,
          data.schemaName,
          data.del
        );
        break;
      case "bgRetrackSchema":
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName,
          undefined,
          true
        );
        if (!result.success) break;
        result = await this.wbCloud.untrackAllTables(cU, data.schemaName);
        if (!result.success) break;
        result = await this.wbCloud.trackAllTables(cU, data.schemaName);
        if (!result.success) break;
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName
        );
        break;
      case "bgTrackAndAddDefaultTablePermissions":
        result = await this.wbCloud.tableBySchemaNameTableName(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.trackTable(cU, result.payload);
        if (!result.success) break;
        result = await this.wbCloud.addDefaultTablePermissions(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName,
          data.tableName
        );
        break;
      case "bgTrackAndRemoveDefaultTablePermissions":
        result = await this.wbCloud.tableBySchemaNameTableName(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.trackTable(cU, result.payload);
        if (!result.success) break;
        result = await this.wbCloud.removeDefaultTablePermissions(
          cU,
          data.schemaName,
          data.tableName
        );
        break;
      case "bgTrackAndRemoveAndAddDefaultTablePermissions":
        result = await this.wbCloud.tableBySchemaNameTableName(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.trackTable(cU, result.payload);
        if (!result.success) break;
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName,
          data.tableName,
          true
        );
        if (!result.success) break;
        result = await this.wbCloud.removeDefaultTablePermissions(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.addDefaultTablePermissions(
          cU,
          data.schemaName,
          data.tableName
        );
        if (!result.success) break;
        result = await this.wbCloud.addOrRemoveAllExistingRelationships(
          cU,
          data.schemaName,
          data.tableName
        );
        break;
      case "bgReplaceProdWithStagingRemoteSchema":
        result = await this.wbCloud.reloadMetadata(cU);
        if (!result.success) break;
        result = await this.wbCloud.replaceProdWithStagingRemoteSchema(cU);
        if (!result.success) break;
        result = await this.wbCloud.dropInconsistentMetadata(cU);
        break;
      default:
        log.error(`  bgQueue.bgRun - ERROR: no case for event.fn ${key}`);
    }
    if (!result.success) {
      log.error(`  bgQueue.bgRun - ERROR result=${JSON.stringify(result)}`);
      if (environment.lambdaBgFunctionName) {
        await mailer.send(
          [environment.mailerAlarmsAddress],
          "[WBALARM] whitebrick-cloud: bgRun",
          JSON.stringify(result)
        );
      }
      await this.dal.bgQueueUpdateStatus(
        BgQueue.BG_STATUS.error,
        id,
        undefined,
        undefined,
        {
          data: data,
          error: result,
        }
      );
    }
    log.info(`  bgQueue.bgRun - returning result=${result}`);
    return result;
  }
}
