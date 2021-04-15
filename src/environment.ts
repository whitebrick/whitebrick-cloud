type Environment = {
  secretMessage: string;
  dbName: string,
  dbHost: string,
  dbPort: number,
  dbUser: string,
  dbPassword: string,
  dbPoolMax: number,
  dbPoolIdleTimeoutMillis: number,
  dbPoolConnectionTimeoutMillis: number,
};

export const environment: Environment = {
  secretMessage: process.env.SECRET_MESSAGE as string,
  dbName: process.env.DB_NAME as string,
  dbHost: process.env.DB_HOST as string,
  dbPort: parseInt(process.env.DB_PORT || '') as number,
  dbUser: process.env.DB_USER as string,
  dbPassword: process.env.DB_PASSWORD as string,
  dbPoolMax: parseInt(process.env.DB_POOL_MAX || '') as number,
  dbPoolIdleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MILLIS || '') as number,
  dbPoolConnectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MILLIS || '') as number,
};

