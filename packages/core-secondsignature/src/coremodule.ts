import { APISymbols } from '@risevision/core-apis';
import {
  ICoreModuleWithModels,
  ModelSymbols,
  utils,
} from '@risevision/core-models';
import { TXSymbols } from '@risevision/core-transactions';
import { BaseCoreModule, Symbols } from '@risevision/core-types';
import { AccountsModelWith2ndSign } from './AccountsModelWith2ndSign';
import { SignHooksListener } from './hooks/hooksListener';
import { SecondSignatureTransaction } from './secondSignature';
import { SignaturesAPI } from './signatureAPI';
import { SignaturesModel } from './SignaturesModel';
import { SigSymbols } from './symbols';

export class CoreModule extends BaseCoreModule
  implements ICoreModuleWithModels {
  public configSchema = {};
  public constants = {};

  public addElementsToContainer() {
    this.container
      .bind(ModelSymbols.model)
      .toConstructor(SignaturesModel)
      .whenTargetNamed(SigSymbols.model);

    this.container
      .bind(TXSymbols.transaction)
      .to(SecondSignatureTransaction)
      .inSingletonScope()
      .whenTargetNamed(SigSymbols.transaction);

    this.container
      .bind(APISymbols.api)
      .toConstructor(SignaturesAPI)
      .whenTargetNamed(SigSymbols.api);

    this.container
      .bind(SigSymbols.hooksListener)
      .to(SignHooksListener)
      .inSingletonScope();
  }

  public onPreInitModels() {
    utils.mergeModels(
      AccountsModelWith2ndSign,
      this.container.getNamed(ModelSymbols.model, Symbols.models.accounts)
    );
  }

  public async initAppElements() {
    await this.container
      .get<SignHooksListener>(SigSymbols.hooksListener)
      .hookMethods();
  }

  public teardown() {
    return this.container
      .get<SignHooksListener>(SigSymbols.hooksListener)
      .unHook();
  }
}
