import {
  AccountPoolReward,
  AccumulatedReward,
  AccumulatedPoolReward,
  HistoryElement,
  RewardType,
} from "../types";
import { SubstrateEvent } from "@subql/types";
import { Codec } from "@polkadot/types/types";
import { INumber } from "@polkadot/types-codec/types/interfaces";
import { PalletNominationPoolsPoolMember } from "@polkadot/types/lookup";
import {
  handleGenericForTxHistory,
  updateAccumulatedGenericReward,
  updateGenericAccountRewards,
} from "./Rewards";
import { getPoolMembers } from "./Cache";
import {
  eventIdFromBlockAndIdxAndAddress,
  timestamp,
  blockNumber,
} from "./common";

export async function handlePoolReward(
  rewardEvent: SubstrateEvent<
    [accountId: Codec, poolId: INumber, reward: INumber]
  >
): Promise<void> {
  await handlePoolRewardForTxHistory(rewardEvent);
  let accumulatedReward = await updateAccumulatedPoolReward(rewardEvent, true);
  await updateAccountPoolRewards(
    rewardEvent,
    RewardType.reward,
    accumulatedReward.amount
  );
}

async function handlePoolRewardForTxHistory(
  rewardEvent: SubstrateEvent<
    [accountId: Codec, poolId: INumber, reward: INumber]
  >
): Promise<void> {
  handleGenericForTxHistory(rewardEvent, async (element: HistoryElement) => {
    const {
      event: {
        data: [account, poolId, amount],
      },
    } = rewardEvent;
    element.address = account.toString();
    element.poolReward = {
      eventIdx: rewardEvent.idx,
      amount: amount.toString(),
      isReward: true,
      poolId: poolId.toNumber(),
    };
    return element;
  });
}

async function updateAccumulatedPoolReward(
  event: SubstrateEvent<[accountId: Codec, poolId: INumber, reward: INumber]>,
  isReward: boolean
): Promise<AccumulatedReward> {
  let {
    event: {
      data: [accountId, _, amount],
    },
  } = event;
  return await updateAccumulatedGenericReward(
    AccumulatedPoolReward,
    accountId.toString(),
    amount.toBigInt(),
    isReward
  );
}

async function updateAccountPoolRewards(
  event: SubstrateEvent<[accountId: Codec, poolId: INumber, reward: INumber]>,
  rewardType: RewardType,
  accumulatedAmount: bigint
): Promise<void> {
  let {
    event: {
      data: [accountId, poolId, amount],
    },
  } = event;

  updateGenericAccountRewards(
    AccountPoolReward,
    event,
    accountId.toString(),
    amount.toBigInt(),
    rewardType,
    accumulatedAmount,
    (element: AccountPoolReward) => {
      element.poolId = poolId.toNumber();
      return element;
    }
  );
}

export async function handlePoolBondedSlash(
  bondedSlashEvent: SubstrateEvent<[poolId: INumber, slash: INumber]>
): Promise<void> {
  const {
    event: {
      data: [poolIdEncoded, slash],
    },
  } = bondedSlashEvent;
  const poolId = poolIdEncoded.toNumber();

  const pool = (await api.query.nominationPools.bondedPools(poolId)).unwrap();

  const members = await api.query.nominationPools.poolMembers.entries();

  await handleRelaychainPooledStakingSlash(
    bondedSlashEvent,
    poolId,
    pool.points.toBigInt(),
    slash.toBigInt(),
    (member: PalletNominationPoolsPoolMember): bigint => {
      return member.points.toBigInt();
    }
  );
}

export async function handlePoolUnbondingSlash(
  unbondingSlashEvent: SubstrateEvent<
    [era: INumber, poolId: INumber, slash: INumber]
  >
): Promise<void> {
  const {
    event: {
      data: [era, poolId, slash],
    },
  } = unbondingSlashEvent;
  const poolIdNumber = poolId.toNumber();
  const eraIdNumber = era.toNumber();

  const unbondingPools = (
    await api.query.nominationPools.subPoolsStorage(poolIdNumber)
  ).unwrap();

  const pool = unbondingPools.withEra[eraIdNumber] ?? unbondingPools.noEra;

  await handleRelaychainPooledStakingSlash(
    unbondingSlashEvent,
    poolIdNumber,
    pool.points.toBigInt(),
    slash.toBigInt(),
    (member: PalletNominationPoolsPoolMember): bigint => {
      return member.unbondingEras[eraIdNumber]?.toBigInt() ?? BigInt(0);
    }
  );
}

async function handleRelaychainPooledStakingSlash(
  event: SubstrateEvent,
  poolId: number,
  poolPoints: bigint,
  slash: bigint,
  memberPointsCounter: (member: PalletNominationPoolsPoolMember) => bigint
): Promise<void> {
  if (poolPoints == BigInt(0)) {
    return;
  }

  const members = await getPoolMembers(blockNumber(event));

  await Promise.all(
    members.map(async ([accountId, member]) => {
      let memberPoints: bigint;
      if (member.poolId.toNumber() === poolId) {
        memberPoints = memberPointsCounter(member);
        if (memberPoints != BigInt(0)) {
          const personalSlash = (slash / poolPoints) * memberPoints;

          await handlePoolSlashForTxHistory(
            event,
            poolId,
            accountId,
            personalSlash
          );
          let accumulatedReward = await updateAccumulatedGenericReward(
            AccumulatedPoolReward,
            accountId,
            personalSlash,
            false
          );
          await updateGenericAccountRewards(
            AccountPoolReward,
            event,
            accountId,
            personalSlash,
            RewardType.slash,
            accumulatedReward.amount,
            (element: AccountPoolReward) => {
              element.poolId = poolId;
              return element;
            }
          );
        }
      }
    })
  );
}

async function handlePoolSlashForTxHistory(
  slashEvent: SubstrateEvent,
  poolId: number,
  accountId: string,
  personalSlash: bigint
): Promise<void> {
  const extrinsic = slashEvent.extrinsic;
  const block = slashEvent.block;
  const blockNumber = block.block.header.number.toString();
  const blockTimestamp = timestamp(block);
  const eventId = eventIdFromBlockAndIdxAndAddress(
    blockNumber,
    slashEvent.idx.toString(),
    accountId
  );

  const element = HistoryElement.create({
    id: eventId,
    timestamp: blockTimestamp,
    blockNumber: block.block.header.number.toNumber(),
    extrinsicHash: extrinsic !== undefined ? extrinsic.extrinsic.hash.toString() : null;
    extrinsicIdx: extrinsic !== undefined ? extrinsic.idx : null;
    address: accountId,
    poolReward: {
      eventIdx: slashEvent.idx,
      amount: personalSlash.toString(),
      isReward: false,
      poolId: poolId,
    }
  });
  
  await element.save();
}
