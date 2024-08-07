import type { OverrideBundleDefinition } from "@polkadot/types/types";

/* eslint-disable sort-keys */

const definitions: OverrideBundleDefinition = {
  types: [
    {
      // on all versions
      minmax: [0, undefined],
      types: {
        ParachainAccountIdOf: "AccountId",
        Proof: {
          leafHash: "Hash",
          sortedHashes: "Vec<Hash>",
        },
        ProxyType: {
          _enum: ["Any", "NonTransfer", "Governance", "_Staking", "NonProxy"],
        },
        RelayChainAccountId: "AccountId",
        RootHashOf: "Hash",
        DispatchErrorModule: "DispatchErrorModuleU8",
      },
    },
  ],
};

export default { typesBundle: { spec: { altair: definitions } } };
