export type ServiceResult =
  | { success: true; payload: any }
  | { success: false; message: string; code: string}
  ;