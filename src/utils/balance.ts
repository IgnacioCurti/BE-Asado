import {
  IPurchaseReceiptWithUsers,
  ITransferInfo,
  IUserBalance,
} from "../models/interfaces";

export function calculateTransfersInfo(
  amounts: IUserBalance[]
): ITransferInfo[] {
  const transferInfo: ITransferInfo[] = [];

  while (amounts.length > 0) {
    amounts.sort((a, b) => a.totalCost - b.totalCost);
    const {
      userId: payerId,
      userName: payerName,
      totalCost: payerTotalCost,
    }: IUserBalance = amounts[0];

    if (payerTotalCost == 0) {
      transferInfo.push({
        userId: payerId,
        userName: payerName,
        amount: payerTotalCost,
        receiver: null,
      });
      amounts.splice(0, 1);
      continue;
    }

    const { userId, userName, userLastName, userCbu, userAlias }: IUserBalance =
      amounts[amounts.length - 1];
    transferInfo.push({
      userId: payerId,
      userName: payerName,
      amount: payerTotalCost * -1,
      receiver: {
        receiverId: userId,
        receiverName: userName,
        receiverLastName: userLastName,
        receiverCbu: userCbu,
        receiverAlias: userAlias,
      },
    });
    const updatedAmount: number = Number(
      (amounts[amounts.length - 1].totalCost + payerTotalCost).toFixed(2)
    );
    amounts[amounts.length - 1].totalCost = updatedAmount;
    amounts.splice(0, 1);
  }
  return transferInfo;
}

export function assignEventValues(
  receipts: IPurchaseReceiptWithUsers[]
): IUserBalance[] {
  const userBalances: IUserBalance[] = [];
  for (const receipt of receipts) {
    const receiptCostPerUser: number = Number(
      (receipt.amount / receipt.participants.length).toFixed(2)
    );
    for (const participant of receipt.participants) {
      const participantEntry = userBalances.find((a) =>
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
          userLastName: participant.lastName ?? "",
          userCbu: participant.cbu ?? "",
          userAlias: participant.alias ?? "",
          totalCost: -receiptCostPerUser,
        });
      }
    }
    const cleanReceiptAmount = Number(
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
      const { _id, name, lastName, cbu, alias } = receipt.shoppingDesignee;
      userBalances.push({
        userId: _id,
        userName: name,
        userLastName: lastName ?? "",
        userCbu: cbu ?? "",
        userAlias: alias ?? "",
        totalCost: cleanReceiptAmount,
      });
    }
  }
  return userBalances;
}
