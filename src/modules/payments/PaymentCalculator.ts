import mongoose from "mongoose";
import {
  IPurchaseReceipt,
  IPurchaseReceiptWithUsers,
  ITransferInfo,
  IUserBalance,
} from "../../models/interfaces.js";

// Núcleo del modelo de pagos: quién le debe cuánto a quién. Clase pura, sin
// acceso a la base; recibe los recibos ya cargados (con usuarios populados).
// Todos los montos se redondean a 2 decimales por recibo.
export class PaymentCalculator {
  // Parte de cada participante en un recibo. Sin participantes nadie lo paga
  // (y al designado no se le acredita nada).
  shareOf(receipt: { amount: number; participants: unknown[] }): number {
    if (receipt.participants.length === 0) return 0;
    return Number((receipt.amount / receipt.participants.length).toFixed(2));
  }

  // Saldo por usuario: negativo = debe, positivo = le deben.
  assignBalances(receipts: IPurchaseReceiptWithUsers[]): IUserBalance[] {
    const userBalances: IUserBalance[] = [];
    for (const receipt of receipts) {
      const receiptCostPerUser: number = this.shareOf(receipt);
      for (const participant of receipt.participants) {
        const participantEntry: IUserBalance | undefined = userBalances.find((a) =>
          participant._id.equals(a.userId)
        );
        if (participantEntry) {
          participantEntry.totalCost = Number(
            (participantEntry.totalCost - receiptCostPerUser).toFixed(2)
          );
        } else {
          userBalances.push({
            userId: participant._id,
            userName: participant.name,
            userLastName: participant.lastName,
            userCbu: participant.cbu,
            userAlias: participant.alias,
            totalCost: -receiptCostPerUser,
          });
        }
      }
      const cleanReceiptAmount: number = Number(
        (receiptCostPerUser * receipt.participants.length).toFixed(2)
      );
      const designeeEntry: IUserBalance | undefined = userBalances.find((a) =>
        receipt.shoppingDesignee._id.equals(a.userId)
      );
      if (designeeEntry) {
        designeeEntry.totalCost = Number(
          (designeeEntry.totalCost + cleanReceiptAmount).toFixed(2)
        );
      } else {
        userBalances.push({
          userId: receipt.shoppingDesignee._id,
          userName: receipt.shoppingDesignee.name,
          userLastName: receipt.shoppingDesignee.lastName,
          userCbu: receipt.shoppingDesignee.cbu,
          userAlias: receipt.shoppingDesignee.alias,
          totalCost: cleanReceiptAmount,
        });
      }
    }
    return userBalances;
  }

  // Transferencias para saldar los saldos. Vacía (muta) el array recibido.
  calculateTransfers(amounts: IUserBalance[]): ITransferInfo[] {
    const transferInfo: ITransferInfo[] = [];

    while (amounts.length > 0) {
      amounts.sort((a, b) => a.totalCost - b.totalCost);
      const payer: IUserBalance = amounts[0];
      if (payer.totalCost == 0) {
        transferInfo.push({
          userId: payer.userId,
          userName: payer.userName,
          amount: payer.totalCost,
          receiver: null,
        });
        amounts.splice(0, 1);
        continue;
      }
      const receiver: IUserBalance = amounts[amounts.length - 1];
      transferInfo.push({
        userId: payer.userId,
        userName: payer.userName,
        amount: payer.totalCost * -1,
        receiver: {
          receiverId: receiver.userId,
          receiverName: receiver.userName,
          receiverLastName: receiver.userLastName,
          receiverCbu: receiver.userCbu,
          receiverAlias: receiver.userAlias,
        },
      });
      const updatedAmount: number = Number(
        (amounts[amounts.length - 1].totalCost + payer.totalCost).toFixed(2)
      );
      amounts[amounts.length - 1].totalCost = updatedAmount;
      amounts.splice(0, 1);
    }
    return transferInfo;
  }

  // Todas las transferencias del evento, incluidas las de monto 0 (receiver null).
  transfersFor(receipts: IPurchaseReceiptWithUsers[]): ITransferInfo[] {
    return this.calculateTransfers(this.assignBalances(receipts));
  }

  // Solo las transferencias que alguien tiene que hacer.
  expectedTransfersFor(receipts: IPurchaseReceiptWithUsers[]): ITransferInfo[] {
    return this.transfersFor(receipts).filter((t) => t.receiver !== null);
  }

  // Lo que le corresponde pagar a un usuario: suma de su parte en cada recibo
  // donde participa, con el mismo redondeo que assignBalances.
  memberCost(receipts: IPurchaseReceipt[], userId: mongoose.Types.ObjectId): number {
    return receipts
      .filter((receipt) => receipt.participants.some((p) => p._id.equals(userId)))
      .reduce(
        (total: number, receipt) => Number((total + this.shareOf(receipt)).toFixed(2)),
        0
      );
  }
}

export const paymentCalculator = new PaymentCalculator();
