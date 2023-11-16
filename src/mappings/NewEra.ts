import { SubstrateEvent } from "@subql/types";
import { eventId } from "./common";
import { EraValidatorInfo } from "../types/models/EraValidatorInfo";

export async function handleStakersElected(
  event: SubstrateEvent
): Promise<void> {
  await handleNewEra(event);
}

export async function handleNewEra(event: SubstrateEvent): Promise<void> {
  const currentEra = (await api.query.staking.currentEra()).unwrap();

  const exposures = await api.query.staking.erasStakersClipped.entries(
    currentEra.toBigInt()
  );

  const eraValidatorInfos = exposures.map(([key, exposure]) => {
    const [, validatorId] = key.args;

    let validatorIdString = validatorId.toString();
    const eraValidatorInfo = EraValidatorInfo.create({
      id: eventId(event) + validatorIdString,
      era: currentEra,
      address: validatorIdString,
      total: exposure.total.toBigInt(),
      own: exposure.own.toBigInt(),
      others: exposure.others.map((other) => {
        return {
          who: other.who.toString(),
          value: other.value.toString(),
        };
      }),
    });

    return eraValidatorInfo.save();
  });

  await Promise.allSettled(eraValidatorInfos);
}
