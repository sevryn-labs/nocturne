import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  collateralAmount(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  debtAmount(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
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
