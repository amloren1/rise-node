import { IAccountsModel } from '@risevision/core-types';
import { createFilterDecorator as createFilter } from '@risevision/core-utils';

/**
 *
 * @codesample filterHook
 */
export const FilterAPIGetAccount = createFilter<
  (what: any, account?: IAccountsModel) => Promise<any>
>('core/apis/accounts/account');
