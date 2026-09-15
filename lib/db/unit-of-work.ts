import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Transaction } from "@libsql/client";
import { getDbClient } from "./client";

const scope = new AsyncLocalStorage<{tx:Transaction;after:Array<()=>Promise<unknown>>}>();
export function currentTransaction() { return scope.getStore()?.tx; }
export function deferUntilCommit(task:()=>Promise<unknown>) {
  const current=scope.getStore(); if (!current) return false;
  current.after.push(task); return true;
}
export async function withDbTransaction<T>(task:()=>Promise<T>):Promise<T> {
  if (scope.getStore()) return task();
  const tx=await getDbClient().transaction("write");
  const state={tx,after:[] as Array<()=>Promise<unknown>>};
  let result:T;
  try {result=await scope.run(state,task);await tx.commit();}
  catch(error) {await tx.rollback();throw error;} finally {tx.close();}
  for (const after of state.after) {try {await after();} catch {console.warn("Post-commit task failed.");}}
  return result;
}
