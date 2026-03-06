import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  collateralAmount(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  debtAmount(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  decimals(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  totalSupply(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  balanceOf(context: __compactRuntime.CircuitContext<PS>,
            account_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  allowance(context: __compactRuntime.CircuitContext<PS>,
            owner_0: { bytes: Uint8Array },
            spender_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  transfer(context: __compactRuntime.CircuitContext<PS>,
           to_0: { bytes: Uint8Array },
           value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  approve(context: __compactRuntime.CircuitContext<PS>,
          spender_0: { bytes: Uint8Array },
          value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  transferFrom(context: __compactRuntime.CircuitContext<PS>,
               tokenOwner_0: { bytes: Uint8Array },
               to_0: { bytes: Uint8Array },
               value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  depositCollateral(context: __compactRuntime.CircuitContext<PS>,
                    amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  mintPUSD(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  repayPUSD(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  withdrawCollateral(context: __compactRuntime.CircuitContext<PS>,
                     amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  liquidate(context: __compactRuntime.CircuitContext<PS>,
            victimCollateral_0: bigint,
            victimDebt_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  decimals(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  totalSupply(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, bigint>;
  balanceOf(context: __compactRuntime.CircuitContext<PS>,
            account_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  allowance(context: __compactRuntime.CircuitContext<PS>,
            owner_0: { bytes: Uint8Array },
            spender_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, bigint>;
  transfer(context: __compactRuntime.CircuitContext<PS>,
           to_0: { bytes: Uint8Array },
           value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  approve(context: __compactRuntime.CircuitContext<PS>,
          spender_0: { bytes: Uint8Array },
          value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  transferFrom(context: __compactRuntime.CircuitContext<PS>,
               tokenOwner_0: { bytes: Uint8Array },
               to_0: { bytes: Uint8Array },
               value_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  depositCollateral(context: __compactRuntime.CircuitContext<PS>,
                    amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  mintPUSD(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  repayPUSD(context: __compactRuntime.CircuitContext<PS>, amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  withdrawCollateral(context: __compactRuntime.CircuitContext<PS>,
                     amount_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  liquidate(context: __compactRuntime.CircuitContext<PS>,
            victimCollateral_0: bigint,
            victimDebt_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly totalCollateral: bigint;
  readonly totalDebt: bigint;
  readonly liquidationRatio: bigint;
  readonly mintingRatio: bigint;
  _balances: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: { bytes: Uint8Array }): boolean;
    lookup(key_0: { bytes: Uint8Array }): bigint;
    [Symbol.iterator](): Iterator<[{ bytes: Uint8Array }, bigint]>
  };
  _allowances: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: { owner: { bytes: Uint8Array }, spender: { bytes: Uint8Array }
                  }): boolean;
    lookup(key_0: { owner: { bytes: Uint8Array }, spender: { bytes: Uint8Array }
                  }): bigint;
    [Symbol.iterator](): Iterator<[{ owner: { bytes: Uint8Array }, spender: { bytes: Uint8Array } }, bigint]>
  };
  readonly _totalSupply: bigint;
  readonly _decimals: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
