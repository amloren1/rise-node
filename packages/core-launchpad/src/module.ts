import { CommanderStatic } from 'commander';
import { Container } from 'inversify';
import { WordPressHookSystem } from 'mangiafuoco';

export interface ICoreModule<ConfigType> {
  configSchema: any;
  constants: any;
  version: string;
  name: string;
  directory: string;
  container?: Container;

  extendCommander(program: CommanderStatic): void;

  setup(hookSystem: WordPressHookSystem): Promise<void>;

  boot(): Promise<void>;

  teardown(): Promise<void>;

  afterConfigValidation?<T extends ConfigType>(config: T): T;

  patchConfigWithCLIParams?<T extends ConfigType>(progrma: CommanderStatic, config: T): T;

  addElementsToContainer(container: Container, config: ConfigType): void;

  initAppElements(container: Container, config: ConfigType): void;
}

export abstract class BaseCoreModule<ConfigType = any> implements ICoreModule<ConfigType> {
  public abstract configSchema: any;
  public abstract constants: any;
  public version = null;
  public name = null;
  public directory = null;
  public container?: Container;

  public extendCommander(program: CommanderStatic): void {
    return void 0;
  }

  public patchConfigWithCLIParams<T extends ConfigType>(program: CommanderStatic, config: T): T {
    return config;
  }

  public setup(hookSystem: WordPressHookSystem): Promise<void> {
    return Promise.resolve();
  }

  public start(): Promise<void> {
    return Promise.resolve();
  }

  public teardown(): Promise<void> {
    return Promise.resolve();
  }

  public afterConfigValidation<T extends ConfigType>(config: T): T {
    return config;
  }

  public abstract addElementsToContainer(container: Container): void;

  public abstract initAppElements(container: Container): void;
}