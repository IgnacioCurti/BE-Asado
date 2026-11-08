import mongoose from "mongoose";

export type TransactionRunner = <T>(work: (session: mongoose.ClientSession) => Promise<T>) => Promise<T>;

// Corre `work` en una transacción: o se aplican todas sus escrituras o
// ninguna. Los repositorios reciben la sesión para sumarse. Requiere un
// replica set. withTransaction puede reintentar `work` ante errores transitorios.
export const runInTransaction: TransactionRunner = async <T>(
  work: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> => {
  const session: mongoose.ClientSession = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result!;
  } finally {
    await session.endSession();
  }
};
