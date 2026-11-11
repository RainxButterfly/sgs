/** 当前版本吊销的测试授权批次；新版本不允许旧批次时在这里追加。 */
export const REVOKED_DEV_BATCHES: string[] = [];

/** 当前版本单独吊销的授权编号（一人一码）；某个码泄露时在这里追加其 serial。 */
export const REVOKED_DEV_SERIALS: string[] = [];